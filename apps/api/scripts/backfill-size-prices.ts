/**
 * Бэкфилл английских названий и цен по размерам для существующих товаров.
 *
 * Использование:
 *   npx tsx scripts/backfill-size-prices.ts [--limit=100] [--delay=2000] [--offset=0]
 *
 * По умолчанию выбираются только товары с пустым size_prices (возобновляемый прогон).
 */
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { getSupabase } from "../src/db/client.js";
import { mapPoizonItemToUpsertRow } from "../src/services/poizon-sync.service.js";
import { getPoisonProvider } from "../src/services/poizon.service.js";
import { refreshRates } from "../src/services/currency.service.js";
import { buildSyncPricingContext } from "../src/services/pricing.service.js";
import type { IPoisonProvider, PoisonProductRaw } from "../src/services/poizon.provider.js";

loadDotEnv();

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const offsetArg = args.find((a) => a.startsWith("--offset="));
const delayArg = args.find((a) => a.startsWith("--delay="));
const probeSpuArg = args.find((a) => a.startsWith("--probe-spu="));

const LIMIT = Number(limitArg?.split("=")[1] ?? "100");
const OFFSET = offsetArg ? Number(offsetArg.split("=")[1]) : null;
const DELAY_MS = Number(delayArg?.split("=")[1] ?? "2000");
const PROBE_SPU_ID = Number(probeSpuArg?.split("=")[1] ?? "81971");

const MAX_RETRIES = 4;
const BACKOFF_BASE_MS = 2000;
const RATE_LIMIT_PATTERN =
  /429|503|403|too many|forbidden resource|service unavailable|service temporarily unavailable/i;

type ProductRow = { id: string; poizon_id: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * 500);
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RATE_LIMIT_PATTERN.test(msg);
}

async function fetchProductDetailWithRetry(
  provider: IPoisonProvider,
  spuId: number,
): Promise<PoisonProductRaw | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await provider.getProductDetail(spuId);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (!isRateLimitError(lastError) || attempt === MAX_RETRIES) {
        throw lastError;
      }
      const waitMs = jitter(BACKOFF_BASE_MS * 2 ** attempt);
      console.warn(
        `[backfill] spuId=${spuId}: rate limit (attempt ${attempt + 1}/${MAX_RETRIES + 1}), ждём ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError ?? new Error(`Failed to fetch spuId=${spuId}`);
}

async function countRemainingEmpty(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("source", "poizon")
    .filter("size_prices", "eq", "{}");

  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchBatch(): Promise<ProductRow[]> {
  let query = getSupabase()
    .from("products")
    .select("id, poizon_id")
    .eq("source", "poizon")
    .filter("size_prices", "eq", "{}")
    .order("updated_at", { ascending: true });

  if (OFFSET != null) {
    query = query.range(OFFSET, OFFSET + LIMIT - 1);
  } else {
    query = query.limit(LIMIT);
  }

  const { data, error } = await query;
  if (error) {
    // Fallback: supabase-js иногда не сравнивает jsonb напрямую
    if (!/size_prices|jsonb|operator/i.test(error.message)) {
      throw new Error(error.message);
    }

    console.warn(
      "[backfill] filter size_prices='{}' не сработал, fallback через select+filter",
    );
    const { data: all, error: allErr } = await getSupabase()
      .from("products")
      .select("id, poizon_id, size_prices")
      .eq("source", "poizon")
      .order("updated_at", { ascending: true });

    if (allErr) throw new Error(allErr.message);

    const empty = (all ?? []).filter((row) => {
      const sp = row.size_prices as Record<string, unknown> | null;
      return !sp || Object.keys(sp).length === 0;
    });

    const slice =
      OFFSET != null
        ? empty.slice(OFFSET, OFFSET + LIMIT)
        : empty.slice(0, LIMIT);

    return slice.map(({ id, poizon_id }) => ({ id, poizon_id }));
  }

  return (data ?? []) as ProductRow[];
}

async function healthCheck(provider: IPoisonProvider): Promise<void> {
  console.log(`[backfill] Health check: probe spuId=${PROBE_SPU_ID}`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const detail = await fetchProductDetailWithRetry(provider, PROBE_SPU_ID);
      if (!detail) {
        throw new Error("probe returned empty detail");
      }
      const skuCount = Object.keys(detail.sizePricesFen).length;
      console.log(
        `[backfill] Health check OK: spuId=${PROBE_SPU_ID}, skuPrices=${skuCount}`,
      );
      return;
    } catch (e) {
      const msg = (e as Error).message;
      if (isRateLimitError(e) && attempt < MAX_RETRIES) {
        const waitMs = jitter(BACKOFF_BASE_MS * 2 ** attempt);
        console.warn(
          `[backfill] Health check: API нестабилен (${msg}), ждём ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }
      throw new Error(
        `API нестабилен, повторите позже. Последняя ошибка: ${msg}`,
      );
    }
  }
}

async function main(): Promise<void> {
  await refreshRates(true);
  const pricingCtx = await buildSyncPricingContext();
  const provider = getPoisonProvider();

  const remainingBefore = await countRemainingEmpty();
  console.log(
    `[backfill] Товаров с пустым size_prices: ${remainingBefore}`,
  );

  if (remainingBefore === 0) {
    console.log("[backfill] Нечего обрабатывать, remaining=0");
    return;
  }

  await healthCheck(provider);

  const rows = await fetchBatch();
  const mode =
    OFFSET != null ? `offset=${OFFSET}, limit=${LIMIT}` : `limit=${LIMIT}`;
  console.log(`[backfill] Обрабатываем ${rows.length} товаров (${mode})`);

  let updated = 0;
  let skippedEmpty = 0;
  let failedApi = 0;
  let invalidId = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const spuId = Number(row.poizon_id);
    if (!Number.isFinite(spuId) || spuId <= 0) {
      invalidId++;
      continue;
    }

    try {
      const detail = await fetchProductDetailWithRetry(provider, spuId);
      if (!detail) {
        failedApi++;
        console.warn(`[backfill] spuId=${row.poizon_id}: пустой detail`);
        continue;
      }

      const upsertRow = mapPoizonItemToUpsertRow(detail, pricingCtx);
      const sizeCount = Object.keys(upsertRow.size_prices ?? {}).length;

      if (sizeCount === 0) {
        skippedEmpty++;
        console.warn(
          `[backfill] spuId=${row.poizon_id}: API без SKU-цен, пропуск (не обновляем)`,
        );
        continue;
      }

      const { error: upErr } = await getSupabase()
        .from("products")
        .update({
          name: upsertRow.name,
          price_cny: upsertRow.price_cny,
          price_rub: upsertRow.price_rub,
          price_usdt: upsertRow.price_usdt,
          size_prices: upsertRow.size_prices,
          sizes: upsertRow.sizes,
          stock: upsertRow.stock,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (upErr) throw new Error(upErr.message);
      updated++;

      if ((i + 1) % 10 === 0 || i === rows.length - 1) {
        console.log(
          `[backfill] ${i + 1}/${rows.length} | updated=${updated} skipped=${skippedEmpty} failed=${failedApi}`,
        );
      }
    } catch (e) {
      failedApi++;
      console.warn(
        `[backfill] spuId=${row.poizon_id}:`,
        (e as Error).message,
      );
    }

    if (i < rows.length - 1) await sleep(DELAY_MS);
  }

  const remainingAfter = await countRemainingEmpty();
  console.log(
    `[backfill] Готово: updated=${updated}, skipped(empty)=${skippedEmpty}, failed(api)=${failedApi}, invalidId=${invalidId}, remaining=${remainingAfter}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
