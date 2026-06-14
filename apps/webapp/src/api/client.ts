const API_BASE = import.meta.env.VITE_API_URL ?? "";

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

export async function apiGet<T>(path: string): Promise<T> {
  const key = path;
  const cached = getCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data as T;
  }

  const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  const data = (await res.json()) as T;
  getCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  invalidateCache();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  invalidateCache();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  invalidateCache();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
}
