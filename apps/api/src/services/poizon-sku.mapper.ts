/** Утилиты маппинга SKU/размеров/названий из ответов Poizon API */

const CJK_REGEX =
  /[\u{3000}-\u{303F}\u{3040}-\u{309F}\u{30A0}-\u{30FF}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{F900}-\u{FAFF}\u{FF00}-\u{FFEF}]/gu;

const SIZE_NAME_REGEX = /size|尺码|尺寸|码/i;

export function stripCjk(text: string): string {
  return text
   .replace(CJK_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveEnglishTitle(opts: {
  distSpuTitle?: string | null;
  structureTitle?: string | null;
  originalTitle?: string | null;
  title?: string | null;
  brand?: string | null;
  articleNumber?: string | null;
}): string {
  const candidates = [
    opts.distSpuTitle,
    opts.structureTitle,
    opts.originalTitle,
    opts.title ? stripCjk(opts.title) : null,
  ];
  for (const c of candidates) {
    const trimmed = c?.trim();
    if (trimmed && !containsCjk(trimmed)) return trimmed;
  }
  const parts = [opts.brand, opts.articleNumber].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return opts.title?.trim() || "Unknown Product";
}

export function containsCjk(text: string): boolean {
  CJK_REGEX.lastIndex = 0;
  return CJK_REGEX.test(text);
}

export type SkuParseResult = {
  sizePricesFen: Record<string, number>;
  stock: Record<string, boolean>;
  sizes: string[];
};

/** goodsInfo / dist API: skuList с minBidPrice и saleAttr */
export function mapGoodsInfoSkuList(
  skuList: Array<{
    minBidPrice?: number;
    distStatus?: string;
    saleAttr?: Array<{
      cnName?: string;
      enName?: string;
      cnValue?: string;
      enValue?: string;
      level?: string | number;
    }>;
  }> | null | undefined,
): SkuParseResult {
  const sizePricesFen: Record<string, number> = {};
  const stock: Record<string, boolean> = {};

  for (const sku of skuList ?? []) {
    const size = extractSizeFromSaleAttrs(sku.saleAttr);
    if (!size) continue;

    const fen = Number(sku.minBidPrice ?? 0);
    const available =
      fen > 0 &&
      sku.distStatus !== "PRODUCT_OFF" &&
      sku.distStatus !== "OFF_SHELF";

    stock[size] = available;
    if (available) {
      const prev = sizePricesFen[size];
      sizePricesFen[size] =
        prev == null || fen < prev ? fen : prev;
    }
  }

  return {
    sizePricesFen,
    stock,
    sizes: Object.keys(stock).sort(numericSizeSort),
  };
}

/** productDetailWithPrice: skus[] с authPrice / price.prices */
export function mapDetailWithPriceSkus(
  skus: Array<{
    authPrice?: number;
    status?: number;
    properties?: Array<{
      level?: number;
      saleProperty?: { name?: string; value?: string };
    }>;
    price?: {
      prices?: Array<{ price?: number; floorPrice?: number }>;
    };
  }> | null | undefined,
): SkuParseResult {
  const sizePricesFen: Record<string, number> = {};
  const stock: Record<string, boolean> = {};

  for (const sku of skus ?? []) {
    const size = extractSizeFromProperties(sku.properties);
    if (!size) continue;

    const fen = resolveSkuPriceFen(sku);
    const available = fen > 0 && sku.status !== 0;

    stock[size] = available;
    if (available) {
      const prev = sizePricesFen[size];
      sizePricesFen[size] =
        prev == null || fen < prev ? fen : prev;
    }
  }

  return {
    sizePricesFen,
    stock,
    sizes: Object.keys(stock).sort(numericSizeSort),
  };
}

function resolveSkuPriceFen(sku: {
  authPrice?: number;
  price?: { prices?: Array<{ price?: number; floorPrice?: number }> };
}): number {
  const prices = sku.price?.prices ?? [];
  for (const p of prices) {
    const candidate = Number(p.price ?? p.floorPrice ?? 0);
    if (candidate > 0) return candidate;
  }
  const auth = Number(sku.authPrice ?? 0);
  if (auth <= 0) return 0;
  // authPrice в API обычно в юанях, price — в фэнях
  return auth >= 1000 ? auth : Math.round(auth * 100);
}

function extractSizeFromSaleAttrs(
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

function extractSizeFromProperties(
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

function numericSizeSort(a: string, b: string): number {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

export function minPriceFen(
  sizePricesFen: Record<string, number>,
  fallbackFen = 0,
): number {
  const values = Object.values(sizePricesFen).filter((v) => v > 0);
  if (!values.length) return fallbackFen;
  return Math.min(...values);
}
