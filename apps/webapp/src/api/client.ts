const API_BASE = import.meta.env.VITE_API_URL ?? "";
const REQUEST_TIMEOUT_MS = 15_000;
/** Импорт по артикулу: Poizon + Shihuo могут занимать до минуты. */
export const IMPORT_REQUEST_TIMEOUT_MS = 120_000;

/** Simple in-memory GET cache with TTL. Invalidated on any write operation. */
const CACHE_TTL_MS = 30_000;
type CacheEntry = { data: unknown; expires: number };
const getCache = new Map<string, CacheEntry>();

function invalidateCache(): void {
  getCache.clear();
}

function headers(): HeadersInit {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": initData,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseErrorResponse(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  throw new Error((err as { error?: string }).error ?? "Request failed");
}

export async function apiGet<T>(path: string): Promise<T> {
  const key = path;
  const cached = getCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data as T;
  }

  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    headers: headers(),
  });
  if (!res.ok) await parseErrorResponse(res);
  const data = (await res.json()) as T;
  getCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

/** GET without in-memory cache (orders, live status). */
export async function apiGetFresh<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    headers: headers(),
  });
  if (!res.ok) await parseErrorResponse(res);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  opts?: { timeoutMs?: number },
): Promise<T> {
  invalidateCache();
  const res = await fetchWithTimeout(
    `${API_BASE}${path}`,
    {
      method: "POST",
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    },
    opts?.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );
  if (!res.ok) await parseErrorResponse(res);
  return res.json() as Promise<T>;
}

/** Прогревает GET-кэш после import/mutation, чтобы карточка открылась без гонки. */
export function seedGetCache<T>(path: string, data: T): void {
  getCache.set(path, { data, expires: Date.now() + CACHE_TTL_MS });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  invalidateCache();
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseErrorResponse(res);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  invalidateCache();
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) await parseErrorResponse(res);
}
