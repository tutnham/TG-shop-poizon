import type { ProductDetail } from "@poizon-shop/shared";
import * as productRepo from "../db/product.repository.js";
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
  buildSizePricesFromCny,
  minSizePrice,
} from "./product-pricing.js";
import {
  buildSyncPricingContext,
  calculateProductPrices,
  type SyncPricingContext,
} from "./pricing.service.js";
import {
  getShihuoPoparceProvider,
  normalizeArticle,
  type ShihuoPoparceProvider,
  type ShihuoProductFull,
  type ShihuoSearchHit,
} from "./shihuo-poparce.provider.js";

export type ProductImportErrorCode = "invalid" | "not_found";

export class ProductImportError extends Error {
  readonly code: ProductImportErrorCode;

  constructor(message: string, code: ProductImportErrorCode) {
    super(message);
    this.name = "ProductImportError";
    this.code = code;
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

  if (items.length === 1) return items[0].spuId;

  return null;
}

async function resolveSpuIdFromPoizonSearch(
  provider: IPoisonProvider,
  keyword: string,
): Promise<number | null> {
  const search = await provider.searchProducts(
    keyword,
    ARTICLE_SEARCH_LIMIT,
    0,
  );
  return pickSpuIdFromArticleSearch(keyword, search.items);
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

function buildShihuoPoizonId(
  goodsId: string,
  styleId: string | null,
): string {
  return `shihuo:${goodsId}:${styleId ?? "0"}`;
}

function mapShihuoProductToUpsertRow(
  full: ShihuoProductFull,
  hit: ShihuoSearchHit,
  ctx: SyncPricingContext,
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

  return {
    poizon_id: buildShihuoPoizonId(full.goodsId, full.styleId),
    name,
    brand,
    category_id: null,
    image_urls: full.images.length ? full.images : [],
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
  const detail = await deps.provider.getProductDetail(spuId);
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

async function importFromShihuoArticle(
  keyword: string,
  shihuo: ShihuoPoparceProvider,
  upsertImportedProduct: typeof productRepo.upsertImportedProduct,
  getProductByPoizonId: typeof productRepo.getProductByPoizonId,
  pricingCtx: SyncPricingContext,
): Promise<ProductDetail> {
  let searchHit: ShihuoSearchHit | null;
  try {
    searchHit = await shihuo.searchByArticle(keyword);
  } catch {
    throw new ProductImportError("Product not found", "not_found");
  }

  if (!searchHit) {
    throw new ProductImportError("Product not found", "not_found");
  }

  let full = await shihuo.fetchProductFull(
    searchHit.goodsId,
    searchHit.styleId,
  );

  if (!full || Object.keys(full.sizePricesCny).length === 0) {
    const priceResult = await shihuo.fetchPrice(
      searchHit.goodsId,
      searchHit.styleId,
    );
    if (!priceResult || priceResult.minPriceCny <= 0) {
      throw new ProductImportError("Product not found", "not_found");
    }

    const prices = calculateProductPrices(priceResult.minPriceCny, pricingCtx);
    const poizonId = buildShihuoPoizonId(
      searchHit.goodsId,
      searchHit.styleId,
    );

    await upsertImportedProduct({
      poizon_id: poizonId,
      name: searchHit.name.trim() || keyword,
      brand: searchHit.name.split(/\s+/)[0] ?? null,
      category_id: null,
      image_urls: [],
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

  const row = mapShihuoProductToUpsertRow(full, searchHit, pricingCtx);
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
    const spuId = await resolveSpuIdFromPoizonSearch(provider, ref.keyword);
    if (spuId != null) {
      return importFromPoizonSpuId(spuId, resolvedDeps, pricingCtx);
    }

    const shihuo = deps.shihuoProvider ?? getShihuoPoparceProvider();
    return importFromShihuoArticle(
      ref.keyword,
      shihuo,
      upsertImportedProduct,
      getProductByPoizonId,
      pricingCtx,
    );
  }

  const spuId = await resolveSpuId(provider, ref);
  return importFromPoizonSpuId(spuId, resolvedDeps, pricingCtx);
}
