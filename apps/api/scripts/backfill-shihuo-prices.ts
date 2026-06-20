/**
 * Бэкфилл scalar-цен через Shihuo Poparce: searchByArticle → fetchPrice.
 *
 * Читает pop2.json, join productId -> products.poizon_id, обновляет price_* и
 * shihuo_goods_id/shihuo_style_id. size_prices не трогает.
 *
 * Использование:
 *   npx tsx scripts/backfill-shihuo-prices.ts [pop2.json] [--dry-run] [--limit=100] [--retries=6]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getSupabase } from "../src/db/client.js";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { refreshRates } from "../src/services/currency.service.js";
import {
  calculatePrices,
  getPricingConfig,
} from "../src/services/pricing.service.js";
import { getShihuoPoparceProvider } from "../src/services/shihuo-poparce.provider.js";

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
const DELAY_MS = Number(delayArg?.split("=")[1] ?? "1500");
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
const POIZON_CHUNK = 200;
const RATE_LIMIT_PATTERN =
  /429|503|403|too many|forbidden resource|service unavailable|service temporarily unavailable/i;
const TRANSIENT_ERROR_PATTERN =
  /aborted|timeout|timed out|econnreset|etimedout|enotfound|eai_again|socket hang up|network|fetch failed|502|504/i;

interface Pop2Product {
  productId: number;
  vendorCode: string;
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
};

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

async function fetchProductsByPoizonIds(
  poizonIds: string[],
): Promise<Map<string, ProductRow>> {
  const map = new Map<string, ProductRow>();

  for (let i = 0; i < poizonIds.length; i += POIZON_CHUNK) {
    const chunk = poizonIds.slice(i, i + POIZON_CHUNK);
    const { data, error } = await getSupabase()
      .from("products")
      .select("id, poizon_id, shihuo_goods_id, shihuo_style_id, price_cny")
      .in("poizon_id", chunk);

    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as ProductRow[]) {
      map.set(row.poizon_id, row);
    }
  }

  return map;
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
  const config = await getPricingConfig({ skipRatesRefresh: true });
  const provider = getShihuoPoparceProvider();

  const pop2ByPoizonId = new Map<string, Pop2Product>();
  for (const p of data.products) {
    pop2ByPoizonId.set(String(p.productId), p);
  }

  let poizonIds = [...pop2ByPoizonId.keys()];
  if (ONLY_POIZON_ID) {
    poizonIds = poizonIds.filter((id) => id === ONLY_POIZON_ID);
  }

  if (OFFSET > 0) poizonIds = poizonIds.slice(OFFSET);
  if (LIMIT != null) poizonIds = poizonIds.slice(0, LIMIT);

  console.log(
    `[backfill-shihuo] candidates=${poizonIds.length} dryRun=${DRY_RUN} force=${FORCE}`,
  );

  const productsByPoizonId = await fetchProductsByPoizonIds(poizonIds);

  let updated = 0;
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

    if (
      !FORCE &&
      dbRow.shihuo_goods_id &&
      dbRow.shihuo_style_id &&
      dbRow.price_cny != null &&
      Number(dbRow.price_cny) > 0
    ) {
      skippedAlreadyMapped++;
      continue;
    }

    try {
      const searchHit = await withRetry(`search poizon=${poizonId}`, () =>
        provider.searchByArticle(vendorCode),
      );

      if (!searchHit) {
        notFound++;
        console.warn(
          `[backfill-shihuo] poizon=${poizonId} vendorCode=${vendorCode}: search miss`,
        );
        if (i < poizonIds.length - 1) await sleep(DELAY_MS);
        continue;
      }

      const styleId = searchHit.styleId ?? undefined;
      const priceResult = await withRetry(`price poizon=${poizonId}`, () =>
        provider.fetchPrice(searchHit.goodsId, styleId),
      );

      if (!priceResult || priceResult.minPriceCny <= 0) {
        noPrice++;
        console.warn(
          `[backfill-shihuo] poizon=${poizonId} goodsId=${searchHit.goodsId}: no supplier price`,
        );
        if (i < poizonIds.length - 1) await sleep(DELAY_MS);
        continue;
      }

      const prices = calculatePrices(priceResult.minPriceCny, config);
      const patch = {
        price_cny: Math.round(priceResult.minPriceCny * 100) / 100,
        price_rub: prices.rub,
        price_usdt: prices.usdt,
        shihuo_goods_id: priceResult.goodsId,
        shihuo_style_id: priceResult.styleId,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

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
      }

      if ((i + 1) % 10 === 0 || i === poizonIds.length - 1) {
        console.log(
          `[backfill-shihuo] ${i + 1}/${poizonIds.length} updated=${updated} dryRun=${dryRun} notFound=${notFound} noPrice=${noPrice} failed=${failed}`,
        );
      }
    } catch (e) {
      failed++;
      console.warn(
        `[backfill-shihuo] poizon=${poizonId}:`,
        (e as Error).message,
      );
    }

    if (i < poizonIds.length - 1) await sleep(DELAY_MS);
  }

  console.log(
    `[backfill-shihuo] done updated=${updated} dryRun=${dryRun} skippedNoVendorCode=${skippedNoVendorCode} skippedNoDbRow=${skippedNoDbRow} skippedAlreadyMapped=${skippedAlreadyMapped} notFound=${notFound} noPrice=${noPrice} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
