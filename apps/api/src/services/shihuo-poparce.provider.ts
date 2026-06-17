import { getEnvOptional } from "../types/env.types.js";

export interface ShihuoSearchHit {
  goodsId: string;
  styleId: string | null;
  name: string;
  /** Search-list price in CNY when present */
  priceCny: number | null;
}

export interface ShihuoPriceResult {
  goodsId: string;
  styleId: string | null;
  minPriceCny: number;
}

const DEFAULT_BASE_URL = "https://poparce.ru/api/shihuo";

function normalizeArticle(value: string): string {
  return value.trim().toUpperCase().replace(/[\s_-]+/g, "");
}

function parseNumericPrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function readId(value: unknown): string | null {
  if (value == null || value === "") return null;
  const id = String(value).trim();
  return id.length > 0 ? id : null;
}

function extractSearchItems(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;

  const candidates = [
    root.items,
    root.list,
    root.data,
    root.results,
    (root.result as Record<string, unknown> | undefined)?.items,
    (root.result as Record<string, unknown> | undefined)?.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function hasExplicitArticleMismatch(
  item: Record<string, unknown>,
  vendorCode: string,
): boolean {
  const normalizedQuery = normalizeArticle(vendorCode);
  if (!normalizedQuery) return false;

  const explicitFields = [item.vendorCode, item.articleNumber, item.article]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => normalizeArticle(v));

  if (explicitFields.length === 0) return false;

  return !explicitFields.some(
    (field) =>
      field === normalizedQuery ||
      field.includes(normalizedQuery) ||
      normalizedQuery.includes(field),
  );
}

function itemRelevanceScore(
  item: Record<string, unknown>,
  vendorCode: string,
): number {
  const normalizedQuery = normalizeArticle(vendorCode);
  if (!normalizedQuery) return 0;

  const fields = [
    item.vendorCode,
    item.articleNumber,
    item.article,
    item.style,
    item.name,
    item.title,
  ]
    .filter((v): v is string => typeof v === "string")
    .map((v) => normalizeArticle(v));

  for (const field of fields) {
    if (field === normalizedQuery) return 100;
    if (field.includes(normalizedQuery) || normalizedQuery.includes(field)) {
      return 50;
    }
  }

  return 0;
}

function mapSearchItem(item: unknown): ShihuoSearchHit | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const goodsId = readId(row.goodsId ?? row.goods_id ?? row.id);
  if (!goodsId) return null;

  const styleId = readId(row.styleId ?? row.style_id);
  const name =
    (typeof row.name === "string" && row.name.trim()) ||
    (typeof row.title === "string" && row.title.trim()) ||
    "";

  return {
    goodsId,
    styleId,
    name,
    priceCny: parseNumericPrice(row.price ?? row.minPrice ?? row.lowestPrice),
  };
}

/** Parse search response and pick first relevant items[0]-style hit. */
export function parseSearchByArticleResponse(
  data: unknown,
  vendorCode: string,
): ShihuoSearchHit | null {
  const items = extractSearchItems(data);
  if (items.length === 0) return null;

  const normalizedQuery = normalizeArticle(vendorCode);
  let best: { hit: ShihuoSearchHit; score: number } | null = null;

  for (const item of items) {
    const hit = mapSearchItem(item);
    if (!hit) continue;

    const score =
      item && typeof item === "object"
        ? itemRelevanceScore(item as Record<string, unknown>, vendorCode)
        : 0;

    if (!normalizedQuery) {
      return hit;
    }

    if (score <= 0) continue;

    if (!best || score > best.score) {
      best = { hit, score };
    }
  }

  if (best) return best.hit;

  const firstItem = items[0];
  if (!firstItem || typeof firstItem !== "object") return null;
  if (hasExplicitArticleMismatch(firstItem as Record<string, unknown>, vendorCode)) {
    return null;
  }

  // Shihuo /search?query= scopes by article; items often omit vendorCode fields.
  return mapSearchItem(firstItem);
}

/** Min numeric supplier price in CNY from /price response. */
export function parseMinSupplierPriceCny(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const suppliers = root.suppliers;
  if (!Array.isArray(suppliers)) return null;

  let min: number | null = null;
  for (const supplier of suppliers) {
    if (!supplier || typeof supplier !== "object") continue;
    const row = supplier as Record<string, unknown>;
    const price = parseNumericPrice(
      row.price ?? row.displayPrice ?? row.discount_price,
    );
    if (price == null) continue;
    min = min == null ? price : Math.min(min, price);
  }

  return min;
}

export class ShihuoPoparceProvider {
  private baseUrl(): string {
    return getEnvOptional("POPARCE_SHIHUO_URL", DEFAULT_BASE_URL);
  }

  private apiKey(): string | undefined {
    return (
      getEnvOptional("POIZON_OFFICIAL_API_KEY") ||
      getEnvOptional("POIZON_API_KEY") ||
      undefined
    );
  }

  private ensureConfigured(): void {
    if (!this.apiKey()) {
      throw new Error(
        "Shihuo Poparce API key not configured. Set POIZON_API_KEY or POIZON_OFFICIAL_API_KEY.",
      );
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    this.ensureConfigured();
    const key = this.apiKey();
    const url = `${this.baseUrl()}${path}`;

    const res = await fetch(url, {
      headers: { "x-api-key": key!, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Shihuo API error: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      );
    }

    return res.json() as Promise<T>;
  }

  async searchByArticle(vendorCode: string): Promise<ShihuoSearchHit | null> {
    const query = vendorCode.trim();
    if (!query) return null;

    const data = await this.fetchJson<unknown>(
      `/search?query=${encodeURIComponent(query)}`,
    );
    return parseSearchByArticleResponse(data, query);
  }

  async fetchPrice(
    goodsId: string | number,
    styleId?: string | number | null,
  ): Promise<ShihuoPriceResult | null> {
    const id = readId(goodsId);
    if (!id) return null;

    const style = readId(styleId ?? null);
    const path =
      style != null
        ? `/price/${encodeURIComponent(id)}?styleId=${encodeURIComponent(style)}`
        : `/price/${encodeURIComponent(id)}`;

    const data = await this.fetchJson<unknown>(path);
    const minPriceCny = parseMinSupplierPriceCny(data);
    if (minPriceCny == null) return null;

    return {
      goodsId: id,
      styleId: style,
      minPriceCny,
    };
  }
}

export function getShihuoPoparceProvider(): ShihuoPoparceProvider {
  return new ShihuoPoparceProvider();
}
