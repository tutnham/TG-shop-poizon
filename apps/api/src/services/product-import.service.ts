import type { ProductDetail } from "@poizon-shop/shared";
import * as productRepo from "../db/product.repository.js";
import { refreshRates } from "./currency.service.js";
import { resolvePoizonRef } from "./poizon-ref-resolver.js";
import {
  enrichWithProductDetail,
  mapPoizonItemToUpsertRow,
} from "./poizon-sync.service.js";
import type { IPoisonProvider } from "./poizon.provider.js";
import { getPoisonProvider } from "./poizon.service.js";
import { buildSyncPricingContext } from "./pricing.service.js";

export type ProductImportErrorCode = "invalid" | "not_found";

export class ProductImportError extends Error {
  readonly code: ProductImportErrorCode;

  constructor(message: string, code: ProductImportErrorCode) {
    super(message);
    this.name = "ProductImportError";
    this.code = code;
  }
}

export type ImportProductDeps = {
  provider?: IPoisonProvider;
  upsertImportedProduct?: typeof productRepo.upsertImportedProduct;
  getProductByPoizonId?: typeof productRepo.getProductByPoizonId;
  buildPricingContext?: typeof buildSyncPricingContext;
  refreshRatesFn?: typeof refreshRates;
};

const SEARCH_LIMIT = 5;

async function resolveSpuId(
  provider: IPoisonProvider,
  ref: NonNullable<ReturnType<typeof resolvePoizonRef>>,
): Promise<number> {
  if (ref.kind === "spuId") return ref.spuId;

  const search = await provider.searchProducts(ref.keyword, SEARCH_LIMIT, 0);
  const first = search.items[0];
  if (!first) {
    throw new ProductImportError("Product not found", "not_found");
  }
  return first.spuId;
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

  const spuId = await resolveSpuId(provider, ref);
  const detail = await provider.getProductDetail(spuId);
  if (!detail) {
    throw new ProductImportError("Product not found", "not_found");
  }

  await refreshRatesFn(false);
  const pricingCtx = await buildPricingContext();
  const enriched = await enrichWithProductDetail(provider, detail);
  const row = mapPoizonItemToUpsertRow(enriched, pricingCtx);

  await upsertImportedProduct(row);

  const product = await getProductByPoizonId(String(spuId));
  if (!product) {
    throw new Error("Product upsert succeeded but read failed");
  }

  return product;
}
