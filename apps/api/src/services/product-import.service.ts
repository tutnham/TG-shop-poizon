import type { ProductDetail } from "@poizon-shop/shared";
import * as productRepo from "../db/product.repository.js";
import { isRetryableUpstreamError } from "../lib/upstream-error.js";
import { refreshRates } from "./currency.service.js";
import { resolvePoizonRef } from "./poizon-ref-resolver.js";
import {
  enrichWithProductDetail,
  mapPoizonItemToUpsertRow,
} from "./poizon-sync.service.js";
import type { IPoisonProvider } from "./poizon.provider.js";
import type { PoisonProductRaw } from "./poizon.provider.js";
import { getPoisonProvider } from "./poizon.service.js";
import {
  type SyncPricingContext,
  buildSyncPricingContext,
  calculateProductPrices,
} from "./pricing.service.js";
import { buildSizePricesFromCny, minSizePrice } from "./product-pricing.js";
import {
  type ShihuoPoparceProvider,
  type ShihuoProductFull,
  type ShihuoSearchHit,
  getShihuoPoparceProvider,
  normalizeArticle,
} from "./shihuo-poparce.provider.js";

export type ProductImportErrorCode =
  | "invalid"
  | "not_found"
  | "upstream_unavailable";

export class ProductImportError extends Error {
  readonly code: ProductImportErrorCode;

  constructor(message: string, code: ProductImportErrorCode) {
    super(message);
    this.name = "ProductImportError";
    this.code = code;
  }
}

function upstreamUnavailableError(): ProductImportError {
  return new ProductImportError(
    "Import service temporarily unavailable",
    "upstream_unavailable",
  );
}

function throwIfRetryableUpstream(err: unknown): void {
  if (isRetryableUpstreamError(err)) {
    throw upstreamUnavailableError();
  }
}

type UpsertRow = Parameters<typeof productRepo.upsertImportedProduct>[0];

export type ImportProductDeps = {
  provider?: IPoisonProvider;
  shihuoProvider?: ShihuoPoparceProvider;
  upsertImportedProduct?: typeof productRepo.upsertImportedProduct;
  getProductByPoizonId?: typeof productRepo.getProductByPoizonId;
  buildPricingContext?: typeof buildSyncPricingContext;
  refreshRatesFn?: typeof refreshRates;
};

const ARTICLE_SEARCH_LIMIT = 20;

type PoizonArticleMatch = {
  spuId: number;
  item: PoisonProductRaw;
};

function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    if (parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function mergeImageUrls(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const url = normalizeImageUrl(raw);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function collectPoizonImages(item: PoisonProductRaw): string[] {
  const urls: string[] = [];
  const add = (url: string | undefined) => {
    const trimmed = url?.trim();
    if (trimmed && !urls.includes(trimmed)) urls.push(trimmed);
  };
  add(item.logoUrl);
  for (const img of item.images ?? []) add(img);
  return urls;
}

function pickSpuIdFromArticleSearch(
  keyword: string,
  items: PoisonProductRaw[],
): number | null {
  if (!items.length) return null;

  const query = normalizeArticle(keyword);
  if (!query) return null;

  for (const item of items) {
    const article = item.articleNumber;
    if (article && normalizeArticle(article) === query) {
      return item.spuId;
    }
  }

  for (const item of items) {
    const article = item.articleNumber;
    if (!article) continue;
    const normalized = normalizeArticle(article);
    if (normalized.includes(query) || query.includes(normalized)) {
      return item.spuId;
    }
  }

  if (items.length === 1) return items[0]?.spuId;

  return null;
}

async function resolvePoizonArticleMatch(
  provider: IPoisonProvider,
  keyword: string,
): Promise<PoizonArticleMatch | null> {
  const search = await provider.searchProducts(
    keyword,
    ARTICLE_SEARCH_LIMIT,
    0,
  );
  const spuId = pickSpuIdFromArticleSearch(keyword, search.items);
  if (spuId == null) return null;
  const item = search.items.find((entry) => entry.spuId === spuId);
  if (!item) return null;
  return { spuId, item };
}

async function resolveSpuIdFromPoizonSearch(
  provider: IPoisonProvider,
  keyword: string,
): Promise<number | null> {
  const match = await resolvePoizonArticleMatch(provider, keyword);
  return match?.spuId ?? null;
}

async function tryResolvePoizonArticleMatch(
  provider: IPoisonProvider,
  keyword: string,
): Promise<PoizonArticleMatch | null> {
  try {
    return await resolvePoizonArticleMatch(provider, keyword);
  } catch (err) {
    console.warn("[import] Poizon search failed:", err);
    return null;
  }
}

async function tryResolveSpuIdFromPoizonSearch(
  provider: IPoisonProvider,
  keyword: string,
): Promise<number | null> {
  const match = await tryResolvePoizonArticleMatch(provider, keyword);
  return match?.spuId ?? null;
}

async function resolveSpuId(
  provider: IPoisonProvider,
  ref: NonNullable<ReturnType<typeof resolvePoizonRef>>,
): Promise<number> {
  if (ref.kind === "spuId") return ref.spuId;

  const spuId = await resolveSpuIdFromPoizonSearch(provider, ref.keyword);
  if (spuId == null) {
    throw new ProductImportError("Product not found", "not_found");
  }
  return spuId;
}

function buildShihuoPoizonId(goodsId: string, styleId: string | null): string {
  return `shihuo:${goodsId}:${styleId ?? "0"}`;
}

function mapShihuoProductToUpsertRow(
  full: ShihuoProductFull,
  hit: ShihuoSearchHit,
  ctx: SyncPricingContext,
  fallbackImages: string[] = [],
): UpsertRow {
  const sizePrices = buildSizePricesFromCny(full.sizePricesCny, ctx);
  const scalar = minSizePrice(sizePrices);
  if (!scalar) {
    throw new ProductImportError("Product not found", "not_found");
  }

  const sizeLabels = Object.keys(full.stock).length
    ? Object.keys(full.stock)
    : Object.keys(sizePrices);

  const name = full.name.trim() || hit.name.trim() || "Imported product";
  const brand = name.split(/\s+/)[0] ?? null;
  const imageUrls = mergeImageUrls(
    fallbackImages,
    full.images,
    hit.imageUrl ? [hit.imageUrl] : [],
  );

  return {
    poizon_id: buildShihuoPoizonId(full.goodsId, full.styleId),
    name,
    brand,
    category_id: null,
    image_urls: imageUrls,
    price_cny: scalar.cny,
    price_rub: scalar.rub,
    price_usdt: scalar.usdt,
    size_prices: sizePrices,
    sizes: { EU: sizeLabels },
    stock: full.stock,
    sold_count: 0,
    is_available: Object.values(full.stock).some(Boolean),
    shihuo_goods_id: full.goodsId,
    shihuo_style_id: full.styleId,
  };
}

async function importFromPoizonSpuId(
  spuId: number,
  deps: Required<
    Pick<
      ImportProductDeps,
      | "provider"
      | "upsertImportedProduct"
      | "getProductByPoizonId"
      | "buildPricingContext"
      | "refreshRatesFn"
    >
  >,
  pricingCtx: SyncPricingContext,
): Promise<ProductDetail> {
  let detail: PoisonProductRaw | null;
  try {
    detail = await deps.provider.getProductDetail(spuId);
  } catch (err) {
    throwIfRetryableUpstream(err);
    throw err;
  }

  if (!detail) {
    throw new ProductImportError("Product not found", "not_found");
  }

  const enriched = await enrichWithProductDetail(deps.provider, detail);
  const row = mapPoizonItemToUpsertRow(enriched, pricingCtx);

  await deps.upsertImportedProduct(row);

  const product = await deps.getProductByPoizonId(String(spuId));
  if (!product) {
    throw new Error("Product upsert succeeded but read failed");
  }

  return product;
}

async function tryImportFromPoizonSpuId(
  spuId: number,
  deps: Required<
    Pick<
      ImportProductDeps,
      | "provider"
      | "upsertImportedProduct"
      | "getProductByPoizonId"
      | "buildPricingContext"
      | "refreshRatesFn"
    >
  >,
  pricingCtx: SyncPricingContext,
): Promise<ProductDetail | null> {
  try {
    return await importFromPoizonSpuId(spuId, deps, pricingCtx);
  } catch (err) {
    if (err instanceof ProductImportError) throw err;
    throwIfRetryableUpstream(err);
    console.warn("[import] Poizon detail import failed:", err);
    return null;
  }
}

async function importFromShihuoArticle(
  keyword: string,
  shihuo: ShihuoPoparceProvider,
  upsertImportedProduct: typeof productRepo.upsertImportedProduct,
  getProductByPoizonId: typeof productRepo.getProductByPoizonId,
  pricingCtx: SyncPricingContext,
  fallbackImages: string[] = [],
  hadPoizonMatch = false,
): Promise<ProductDetail> {
  let searchHit: ShihuoSearchHit | null;
  try {
    searchHit = await shihuo.searchByArticle(keyword);
  } catch (err) {
    if (hadPoizonMatch) throw upstreamUnavailableError();
    throwIfRetryableUpstream(err);
    throw new ProductImportError("Product not found", "not_found");
  }

  if (!searchHit) {
    throw new ProductImportError("Product not found", "not_found");
  }

  let full: ShihuoProductFull | null = null;
  try {
    full = await shihuo.fetchProductFull(searchHit.goodsId, searchHit.styleId);
  } catch (err) {
    console.warn("[import] Shihuo product-full failed:", err);
    throwIfRetryableUpstream(err);
  }

  if (!full || Object.keys(full.sizePricesCny).length === 0) {
    let priceResult = null;
    try {
      priceResult = await shihuo.fetchPrice(
        searchHit.goodsId,
        searchHit.styleId,
      );
    } catch (err) {
      console.warn("[import] Shihuo price failed:", err);
      throwIfRetryableUpstream(err);
    }
    if (!priceResult || priceResult.minPriceCny <= 0) {
      if (hadPoizonMatch) throw upstreamUnavailableError();
      throw new ProductImportError("Product not found", "not_found");
    }

    const prices = calculateProductPrices(priceResult.minPriceCny, pricingCtx);
    const poizonId = buildShihuoPoizonId(searchHit.goodsId, searchHit.styleId);
    const imageUrls = mergeImageUrls(
      fallbackImages,
      searchHit.imageUrl ? [searchHit.imageUrl] : [],
    );

    await upsertImportedProduct({
      poizon_id: poizonId,
      name: searchHit.name.trim() || keyword,
      brand: searchHit.name.split(/\s+/)[0] ?? null,
      category_id: null,
      image_urls: imageUrls,
      price_cny: Math.round(priceResult.minPriceCny * 100) / 100,
      price_rub: prices.rub,
      price_usdt: prices.usdt,
      size_prices: {},
      sizes: { EU: [] },
      stock: {},
      sold_count: 0,
      is_available: true,
      shihuo_goods_id: searchHit.goodsId,
      shihuo_style_id: searchHit.styleId,
    });

    const product = await getProductByPoizonId(poizonId);
    if (!product) {
      throw new Error("Product upsert succeeded but read failed");
    }
    return product;
  }

  const row = mapShihuoProductToUpsertRow(
    full,
    searchHit,
    pricingCtx,
    fallbackImages,
  );
  await upsertImportedProduct(row);

  const product = await getProductByPoizonId(row.poizon_id);
  if (!product) {
    throw new Error("Product upsert succeeded but read failed");
  }

  return product;
}

export async function importProductByQuery(
  query: string,
  deps: ImportProductDeps = {},
): Promise<ProductDetail> {
  const ref = resolvePoizonRef(query);
  if (!ref) {
    throw new ProductImportError("Invalid product reference", "invalid");
  }

  const provider = deps.provider ?? getPoisonProvider();
  const upsertImportedProduct =
    deps.upsertImportedProduct ?? productRepo.upsertImportedProduct;
  const getProductByPoizonId =
    deps.getProductByPoizonId ?? productRepo.getProductByPoizonId;
  const buildPricingContext =
    deps.buildPricingContext ?? buildSyncPricingContext;
  const refreshRatesFn = deps.refreshRatesFn ?? refreshRates;

  await refreshRatesFn(false);
  const pricingCtx = await buildPricingContext();

  const resolvedDeps = {
    provider,
    upsertImportedProduct,
    getProductByPoizonId,
    buildPricingContext,
    refreshRatesFn,
  };

  if (ref.kind === "article") {
    const poizonMatch = await tryResolvePoizonArticleMatch(
      provider,
      ref.keyword,
    );
    if (poizonMatch) {
      try {
        const product = await tryImportFromPoizonSpuId(
          poizonMatch.spuId,
          resolvedDeps,
          pricingCtx,
        );
        if (product) return product;
      } catch (err) {
        if (
          err instanceof ProductImportError &&
          err.code === "upstream_unavailable"
        ) {
          throw err;
        }
      }
    }

    const shihuo = deps.shihuoProvider ?? getShihuoPoparceProvider();
    return importFromShihuoArticle(
      ref.keyword,
      shihuo,
      upsertImportedProduct,
      getProductByPoizonId,
      pricingCtx,
      poizonMatch ? collectPoizonImages(poizonMatch.item) : [],
      Boolean(poizonMatch),
    );
  }

  const spuId = await resolveSpuId(provider, ref);
  return importFromPoizonSpuId(spuId, resolvedDeps, pricingCtx);
}
