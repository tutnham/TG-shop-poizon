/**
 * Бэкфилл цен через Shihuo Poparce: searchByArticle → product-full (per-size prices).
 * Фолбэк на fetchPrice (scalar) если product-full без размерных цен.
 *
 * Читает pop2.json, join productId -> products.poizon_id, обновляет price_*,
 * size_prices, sizes, stock и shihuo_goods_id/shihuo_style_id.
 *
 * Использование:
 *   npx tsx scripts/backfill-shihuo-prices.ts [pop2.json] [--dry-run] [--limit=100] [--retries=6]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SizePricesMap } from "@poizon-shop/shared";
import { getSupabase } from "../src/db/client.js";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { refreshRates } from "../src/services/currency.service.js";
import {
  buildSizePricesFromCny,
  minSizePrice,
} from "../src/services/product-pricing.js";
import {
  buildSyncPricingContext,
  calculateProductPrices,
} from "../src/services/pricing.service.js";
import { getPoisonProvider } from "../src/services/poizon.service.js";
import { mapPoizonItemToUpsertRow } from "../src/services/poizon-sync.service.js";
import { getShihuoPoparceProvider } from "../src/services/shihuo-poparce.provider.js";
import type { SyncPricingContext } from "../src/services/pricing.service.js";

loadDotEnv();

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith("--"));
const limitArg = args.find((a) => a.startsWith("--limit="));
const offsetArg = args.find((a) => a.startsWith("--offset="));
const delayArg = args.find((a) => a.startsWith("--delay="));
const retriesArg = args.find((a) => a.startsWith("--retries="));
const onlyPoizonArg = args.find((a) => a.startsWith("--only-poizon-id="));

const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : null;
const OFFSET = offsetArg ? Number(offsetArg.split("=")[1]) : 0;
const DELAY_MS = Number(delayArg?.split("=")[1] ?? "4000");
const DEFAULT_MAX_RETRIES = 6;
const MAX_RETRIES_RAW = retriesArg
  ? Number(retriesArg.split("=")[1])
  : DEFAULT_MAX_RETRIES;
const MAX_RETRIES =
  Number.isFinite(MAX_RETRIES_RAW) && MAX_RETRIES_RAW >= 0
    ? Math.floor(MAX_RETRIES_RAW)
    : DEFAULT_MAX_RETRIES;
const ONLY_POIZON_ID = onlyPoizonArg?.split("=")[1]?.trim() ?? null;

const BACKOFF_BASE_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const RATE_LIMIT_COOLDOWN_MS = 90_000;
const RATE_LIMIT_PATTERN =
  /429|503|403|too many|forbidden resource|service unavailable|service temporarily unavailable/i;
const TRANSIENT_ERROR_PATTERN =
  /aborted|timeout|timed out|econnreset|etimedout|enotfound|eai_again|socket hang up|network|fetch failed|502|504/i;

interface Pop2Product {
  productId: number;
  vendorCode: string;
  price?: number;
}

interface Pop2Data {
  products: Pop2Product[];
}

type ProductRow = {
  id: string;
  poizon_id: string;
  shihuo_goods_id: string | null;
  shihuo_style_id: string | null;
  price_cny: number | null;
  size_prices: SizePricesMap | null;
};

function hasSizePrices(sizePrices: SizePricesMap | null | undefined): boolean {
  return Boolean(sizePrices && Object.keys(sizePrices).length > 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * 400);
}

function getRetryableErrorType(err: unknown): "rate_limit" | "transient" | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (RATE_LIMIT_PATTERN.test(msg)) return "rate_limit";
  if (TRANSIENT_ERROR_PATTERN.test(msg)) return "transient";
  return null;
}

function isRetryableError(err: unknown): boolean {
  return getRetryableErrorType(err) !== null;
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const retryableType = getRetryableErrorType(lastError);
      if (!isRetryableError(lastError) || attempt === MAX_RETRIES) {
        if (retryableType && attempt === MAX_RETRIES) {
          console.warn(
            `[backfill-shihuo] ${label}: ${retryableType} retries exhausted after ${MAX_RETRIES + 1} attempts`,
          );
        }
        throw lastError;
      }
      const waitMs = jitter(
        Math.min(MAX_BACKOFF_MS, BACKOFF_BASE_MS * 2 ** attempt),
      );
      console.warn(
        `[backfill-shihuo] ${label}: ${retryableType} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), wait ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError ?? new Error(`${label} failed`);
}

async function tryPoizonSizePrices(
  vendorCode: string,
  ctx: SyncPricingContext,
): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const provider = getPoisonProvider();
      const search = await provider.searchProducts(vendorCode, 3, 0);
      const hit = search.items[0];
      if (!hit) return null;

      await sleep(1500);
      const detail = await provider.getProductDetail(hit.spuId);
      if (!detail || Object.keys(detail.sizePricesFen).length === 0) return null;

      const row = mapPoizonItemToUpsertRow(detail, ctx);
      if (!row.size_prices || Object.keys(row.size_prices).length === 0) {
        return null;
      }

      return {
        name: row.name,
        price_cny: row.price_cny,
        price_rub: row.price_rub,
        price_usdt: row.price_usdt,
        size_prices: row.size_prices,
        sizes: row.sizes,
        stock: row.stock,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (RATE_LIMIT_PATTERN.test(msg) && attempt < 2) {
        const waitMs = jitter(BACKOFF_BASE_MS * 2 ** (attempt + 2));
        console.warn(
          `[backfill-shihuo] poizon fallback vendorCode=${vendorCode}: ${msg}, wait ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }
      console.warn(
        `[backfill-shihuo] poizon fallback vendorCode=${vendorCode}:`,
        msg,
      );
      return null;
    }
  }
  return null;
}

async function fetchProductsByPoizonIds(
  keepSet: Set<string>,
): Promise<Map<string, ProductRow>> {
  const map = new Map<string, ProductRow>();
  let lastId = "00000000-0000-0000-0000-000000000000";
  const pageSize = 200;

  while (true) {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { data, error } = await getSupabase()
          .from("products")
          .select(
            "id, poizon_id, shihuo_goods_id, shihuo_style_id, price_cny, size_prices",
          )
          .eq("source", "poizon")
          .gt("id", lastId)
          .order("id", { ascending: true })
          .limit(pageSize);

        if (error) throw new Error(error.message);

        const batch = (data ?? []) as ProductRow[];
        if (batch.length === 0) return map;

        for (const row of batch) {
          lastId = row.id;
          if (keepSet.has(row.poizon_id)) {
            map.set(row.poizon_id, row);
          }
        }

        if (batch.length < pageSize) return map;
        lastError = null;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES) {
          const waitMs = jitter(
            Math.min(MAX_BACKOFF_MS, BACKOFF_BASE_MS * 2 ** attempt),
          );
          console.warn(
            `[backfill-shihuo] fetch page after ${lastId}: ${lastError.message}, retry in ${waitMs}ms`,
          );
          await sleep(waitMs);
        }
      }
    }

    if (lastError) throw lastError;
  }
}

async function main(): Promise<void> {
  const filePath =
    fileArg ??
    fileURLToPath(new URL("../../../pop2.json", import.meta.url));

  let data: Pop2Data;
  try {
    data = JSON.parse(readFileSync(filePath, "utf-8")) as Pop2Data;
  } catch (e) {
    console.error("[backfill-shihuo] Failed to read JSON:", (e as Error).message);
    process.exit(1);
  }

  if (!Array.isArray(data.products)) {
    console.error("[backfill-shihuo] pop2.json must contain products[]");
    process.exit(1);
  }

  await refreshRates(true);
  const pricingCtx = await buildSyncPricingContext();
  const provider = getShihuoPoparceProvider();

  const pop2ByPoizonId = new Map<string, Pop2Product>();
  for (const p of data.products) {
    if (p.price != null && p.price <= 0) continue;
    pop2ByPoizonId.set(String(p.productId), p);
  }

  let poizonIds = [...pop2ByPoizonId.keys()];
  if (ONLY_POIZON_ID) {
    poizonIds = poizonIds.filter((id) => id === ONLY_POIZON_ID);
  }

  console.log(
    `[backfill-shihuo] candidates=${poizonIds.length} dryRun=${DRY_RUN} force=${FORCE}`,
  );

  const productsByPoizonId = await fetchProductsByPoizonIds(new Set(poizonIds));
  console.log(`[backfill-shihuo] loaded ${productsByPoizonId.size} DB rows for candidates`);

  poizonIds.sort((a, b) => {
    const rowA = productsByPoizonId.get(a);
    const rowB = productsByPoizonId.get(b);
    const score = (row: ProductRow | undefined): number => {
      if (!row) return 3;
      if (!FORCE && hasSizePrices(row.size_prices)) return 4;
      if (row.shihuo_goods_id) return 0;
      return 1;
    };
    return score(rowA) - score(rowB);
  });

  if (!FORCE) {
    poizonIds = poizonIds.filter((id) => {
      const row = productsByPoizonId.get(id);
      return row != null && !hasSizePrices(row.size_prices);
    });
  }

  console.log(`[backfill-shihuo] work queue=${poizonIds.length} (without size_prices)`);

  if (OFFSET > 0) poizonIds = poizonIds.slice(OFFSET);
  if (LIMIT != null) poizonIds = poizonIds.slice(0, LIMIT);

  console.log(`[backfill-shihuo] processing=${poizonIds.length} offset=${OFFSET} limit=${LIMIT ?? "all"}`);

  let updated = 0;
  let updatedWithSizes = 0;
  let updatedScalarFallback = 0;
  let dryRun = 0;
  let skippedNoVendorCode = 0;
  let skippedNoDbRow = 0;
  let skippedAlreadyMapped = 0;
  let notFound = 0;
  let noPrice = 0;
  let failed = 0;

  for (let i = 0; i < poizonIds.length; i++) {
    const poizonId = poizonIds[i];
    const pop2 = pop2ByPoizonId.get(poizonId);
    const dbRow = productsByPoizonId.get(poizonId);

    if (!pop2) continue;

    const vendorCode = pop2.vendorCode?.trim();
    if (!vendorCode) {
      skippedNoVendorCode++;
      continue;
    }

    if (!dbRow) {
      skippedNoDbRow++;
      continue;
    }

    if (!FORCE && hasSizePrices(dbRow.size_prices)) {
      skippedAlreadyMapped++;
      continue;
    }

    try {
      let patch: Record<string, unknown> | null =
        await tryPoizonSizePrices(vendorCode, pricingCtx);

      if (patch) {
        console.log(
          `[backfill-shihuo] poizon=${poizonId} vendorCode=${vendorCode}: poizon primary OK`,
        );
      }

      if (!patch || !("size_prices" in patch)) {
        try {
          let goodsId = dbRow.shihuo_goods_id ?? undefined;
          let styleId = dbRow.shihuo_style_id ?? undefined;

          if (!goodsId) {
            const searchHit = await withRetry(`search poizon=${poizonId}`, () =>
              provider.searchByArticle(vendorCode),
            );

            if (!searchHit) {
              throw new Error("shihuo search miss");
            }

            goodsId = searchHit.goodsId;
            styleId = searchHit.styleId ?? undefined;
          }

          const productFull = await withRetry(
            `product-full poizon=${poizonId}`,
            () => provider.fetchProductFull(goodsId!, styleId),
          );

          if (productFull && Object.keys(productFull.sizePricesCny).length > 0) {
            const sizePrices = buildSizePricesFromCny(
              productFull.sizePricesCny,
              pricingCtx,
            );
            const scalar = minSizePrice(sizePrices);
            if (!scalar) throw new Error("empty size_prices after shihuo mapping");

            const sizeLabels = Object.keys(productFull.stock).length
              ? Object.keys(productFull.stock)
              : Object.keys(sizePrices);

            patch = {
              price_cny: scalar.cny,
              price_rub: scalar.rub,
              price_usdt: scalar.usdt,
              size_prices: sizePrices,
              sizes: { EU: sizeLabels },
              stock: productFull.stock,
              shihuo_goods_id: productFull.goodsId,
              shihuo_style_id: productFull.styleId,
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          } else {
            const priceResult = await withRetry(`price poizon=${poizonId}`, () =>
              provider.fetchPrice(goodsId!, styleId),
            );

            if (!priceResult || priceResult.minPriceCny <= 0) {
              throw new Error("shihuo scalar fallback failed");
            }

            const prices = calculateProductPrices(
              priceResult.minPriceCny,
              pricingCtx,
            );
            patch = {
              price_cny: Math.round(priceResult.minPriceCny * 100) / 100,
              price_rub: prices.rub,
              price_usdt: prices.usdt,
              shihuo_goods_id: priceResult.goodsId,
              shihuo_style_id: priceResult.styleId,
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          }
        } catch (shihuoErr) {
          console.warn(
            `[backfill-shihuo] poizon=${poizonId} shihuo path failed:`,
            (shihuoErr as Error).message,
          );
        }
      }

      if (!patch) {
        noPrice++;
        console.warn(
          `[backfill-shihuo] poizon=${poizonId} vendorCode=${vendorCode}: no price from shihuo or poizon`,
        );
        if (i < poizonIds.length - 1) await sleep(DELAY_MS);
        continue;
      }

      if (!("size_prices" in patch)) {
        notFound++;
      }

      if (DRY_RUN) {
        dryRun++;
        console.log(
          `[backfill-shihuo][dry-run] poizon=${poizonId} vendorCode=${vendorCode} ->`,
          patch,
        );
      } else {
        const { error: upErr } = await getSupabase()
          .from("products")
          .update(patch)
          .eq("id", dbRow.id);

        if (upErr) throw new Error(upErr.message);
        updated++;
        if ("size_prices" in patch) updatedWithSizes++;
        else updatedScalarFallback++;
      }

      if ((i + 1) % 10 === 0 || i === poizonIds.length - 1) {
        console.log(
          `[backfill-shihuo] ${i + 1}/${poizonIds.length} updated=${updated} withSizes=${updatedWithSizes} scalarFallback=${updatedScalarFallback} dryRun=${dryRun} notFound=${notFound} noPrice=${noPrice} failed=${failed}`,
        );
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[backfill-shihuo] poizon=${poizonId}:`, msg);
      if (RATE_LIMIT_PATTERN.test(msg) || TRANSIENT_ERROR_PATTERN.test(msg)) {
        console.warn(
          `[backfill-shihuo] cooldown ${RATE_LIMIT_COOLDOWN_MS}ms after upstream error`,
        );
        await sleep(RATE_LIMIT_COOLDOWN_MS);
      }
    }

    if (i < poizonIds.length - 1) await sleep(DELAY_MS);
  }

  console.log(
    `[backfill-shihuo] done updated=${updated} withSizes=${updatedWithSizes} scalarFallback=${updatedScalarFallback} dryRun=${dryRun} skippedNoVendorCode=${skippedNoVendorCode} skippedNoDbRow=${skippedNoDbRow} skippedAlreadyMapped=${skippedAlreadyMapped} notFound=${notFound} noPrice=${noPrice} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
