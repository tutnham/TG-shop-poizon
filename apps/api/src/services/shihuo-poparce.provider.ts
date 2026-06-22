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

export interface ShihuoProductFull {
  goodsId: string;
  styleId: string | null;
  name: string;
  images: string[];
  /** Min supplier price in CNY per size (available sizes only) */
  sizePricesCny: Record<string, number>;
  stock: Record<string, boolean>;
}

const DEFAULT_BASE_URL = "https://poparce.ru/api/shihuo";
const SIZE_NAME_REGEX = /size|尺码|尺寸|码/i;

function normalizeArticle(value: string): string {
  return value.trim().toUpperCase().replace(/[\s_-]+/g, "");
}

export { normalizeArticle };

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

function readBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function extractSizeLabelFromAttrs(
  attrs: Array<{
    cnName?: string;
    enName?: string;
    cnValue?: string;
    enValue?: string;
    level?: string | number;
  }> | undefined,
): string | null {
  if (!attrs?.length) return null;

  const sizeAttr =
    attrs.find(
      (a) =>
        SIZE_NAME_REGEX.test(a.enName ?? "") ||
        SIZE_NAME_REGEX.test(a.cnName ?? ""),
    ) ??
    attrs.find((a) => String(a.level) === "2") ??
    attrs[attrs.length - 1];

  const value = (sizeAttr?.enValue ?? sizeAttr?.cnValue ?? "").trim();
  return value || null;
}

function extractSizeLabelFromProperties(
  properties: Array<{
    level?: number;
    saleProperty?: { name?: string; value?: string };
  }> | undefined,
): string | null {
  if (!properties?.length) return null;

  const sizeProp =
    properties.find((p) =>
      SIZE_NAME_REGEX.test(p.saleProperty?.name ?? ""),
    ) ??
    properties.find((p) => p.level === 2) ??
    properties[properties.length - 1];

  const value = sizeProp?.saleProperty?.value?.trim();
  return value || null;
}

function extractSizeLabel(row: Record<string, unknown>): string | null {
  const directFields = [
    row.size,
    row.sizeValue,
    row.value,
    row.euSize,
    row.enValue,
    row.cnValue,
  ];
  for (const field of directFields) {
    if (typeof field === "string" && field.trim()) return field.trim();
    if (typeof field === "number" && Number.isFinite(field)) {
      return String(field);
    }
  }

  if (typeof row.name === "string" && row.name.trim() && !row.title) {
    return row.name.trim();
  }

  const fromSaleAttr = extractSizeLabelFromAttrs(
    row.saleAttr as Parameters<typeof extractSizeLabelFromAttrs>[0],
  );
  if (fromSaleAttr) return fromSaleAttr;

  return extractSizeLabelFromProperties(
    row.properties as Parameters<typeof extractSizeLabelFromProperties>[0],
  );
}

function extractSizePriceCny(row: Record<string, unknown>): number | null {
  const direct = parseNumericPrice(
    row.price ??
      row.minPrice ??
      row.minPriceCny ??
      row.priceCny ??
      row.displayPrice ??
      row.lowestPrice,
  );
  if (direct != null) return direct;

  const fen = parseNumericPrice(row.minBidPrice ?? row.authPrice);
  if (fen != null) {
    // minBidPrice/authPrice may be in fen when >= 1000
    const auth = Number(row.authPrice ?? row.minBidPrice ?? 0);
    if (auth >= 1000) return auth / 100;
    return fen;
  }

  return parseMinSupplierPriceCny(row);
}

function extractSizeEntries(payload: Record<string, unknown>): unknown[] {
  const candidates = [
    payload.sizes,
    payload.sizeList,
    payload.skuList,
    payload.skus,
    payload.list,
    payload.data,
    (payload.product as Record<string, unknown> | undefined)?.sizes,
    (payload.product as Record<string, unknown> | undefined)?.sizeList,
    (payload.product as Record<string, unknown> | undefined)?.skuList,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function extractProductImages(payload: Record<string, unknown>): string[] {
  const urls: string[] = [];

  const pushUrl = (value: unknown) => {
    if (typeof value === "string" && value.trim()) urls.push(value.trim());
  };

  const images = payload.images ?? payload.gallery ?? payload.baseImage;
  if (Array.isArray(images)) {
    for (const img of images) {
      if (typeof img === "string") pushUrl(img);
      else if (img && typeof img === "object") {
        pushUrl((img as Record<string, unknown>).url);
      }
    }
  }

  const spuImages = (
    payload.image as { spuImage?: { images?: Array<{ url: string }> } } | undefined
  )?.spuImage?.images;
  if (Array.isArray(spuImages)) {
    for (const img of spuImages) pushUrl(img.url);
  }

  return [...new Set(urls)];
}

function numericSizeSort(a: string, b: string): number {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Parse /product-full response into per-size CNY prices and stock. */
export function parseProductFullResponse(
  data: unknown,
  goodsIdFallback?: string | number | null,
): ShihuoProductFull | null {
  if (!data || typeof data !== "object") return null;

  const root = data as Record<string, unknown>;
  const payload = (
    root.result && typeof root.result === "object" ? root.result : root
  ) as Record<string, unknown>;

  const goodsId =
    readId(payload.goodsId ?? payload.goods_id ?? root.goodsId) ??
    readId(goodsIdFallback ?? null);
  if (!goodsId) return null;

  const styleId = readId(payload.styleId ?? payload.style_id ?? root.styleId);
  const name =
    (typeof payload.title === "string" && payload.title.trim()) ||
    (typeof payload.name === "string" && payload.name.trim()) ||
    (typeof (payload.product as Record<string, unknown> | undefined)?.title ===
      "string" &&
      (
        (payload.product as Record<string, unknown>).title as string
      ).trim()) ||
    "";

  const sizePricesCny: Record<string, number> = {};
  const stock: Record<string, boolean> = {};

  for (const entry of extractSizeEntries(payload)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const size = extractSizeLabel(row);
    if (!size) continue;

    const priceCny = extractSizePriceCny(row);
    const explicitAvailable = readBool(row.available ?? row.inStock ?? row.in_stock);
    const available =
      explicitAvailable != null ? explicitAvailable : priceCny != null;

    stock[size] = available;
    if (!available || priceCny == null) continue;

    const prev = sizePricesCny[size];
    sizePricesCny[size] =
      prev == null || priceCny < prev ? priceCny : prev;
  }

  const sortedLabels = Object.keys(stock).sort(numericSizeSort);
  const sortedSizePrices: Record<string, number> = {};
  const sortedStock: Record<string, boolean> = {};
  for (const size of sortedLabels) {
    sortedStock[size] = stock[size] ?? false;
    if (sizePricesCny[size] != null) {
      sortedSizePrices[size] = sizePricesCny[size];
    }
  }

  return {
    goodsId,
    styleId,
    name,
    images: extractProductImages(payload),
    sizePricesCny: sortedSizePrices,
    stock: sortedStock,
  };
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

  async fetchProductFull(
    goodsId: string | number,
    styleId?: string | number | null,
  ): Promise<ShihuoProductFull | null> {
    const id = readId(goodsId);
    if (!id) return null;

    const style = readId(styleId ?? null);
    const path =
      style != null
        ? `/product-full/${encodeURIComponent(id)}?styleId=${encodeURIComponent(style)}`
        : `/product-full/${encodeURIComponent(id)}`;

    const data = await this.fetchJson<unknown>(path);
    const parsed = parseProductFullResponse(data, id);
    if (!parsed) return null;
    if (Object.keys(parsed.sizePricesCny).length === 0) return null;

    return {
      ...parsed,
      goodsId: id,
      styleId: style ?? parsed.styleId,
    };
  }
}

export function getShihuoPoparceProvider(): ShihuoPoparceProvider {
  return new ShihuoPoparceProvider();
}
