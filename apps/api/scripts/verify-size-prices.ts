/**
 * Верификация заполнения size_prices после бэкфилла.
 *
 * Использование:
 *   npx tsx scripts/verify-size-prices.ts
 */
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { getSupabase } from "../src/db/client.js";
import { minSizePrice } from "../src/services/product-pricing.js";
import type { SizePricesMap } from "../src/services/product-pricing.js";

loadDotEnv();

async function main(): Promise<void> {
  const sb = getSupabase();

  const { count: totalPoizon, error: totalErr } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("source", "poizon");

  if (totalErr) throw new Error(totalErr.message);

  const { count: emptyCount, error: emptyErr } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("source", "poizon")
    .filter("size_prices", "eq", "{}");

  if (emptyErr) throw new Error(emptyErr.message);

  const filled = (totalPoizon ?? 0) - (emptyCount ?? 0);
  console.log(`[verify] poizon total=${totalPoizon}, filled=${filled}, empty=${emptyCount}`);

  const { data: sample, error: sampleErr } = await sb
    .from("products")
    .select("id, poizon_id, name, price_rub, size_prices")
    .eq("source", "poizon")
    .not("size_prices", "eq", "{}")
    .limit(5);

  if (sampleErr) throw new Error(sampleErr.message);

  if (!sample?.length) {
    console.log("[verify] Нет товаров с заполненным size_prices для spot-check");
    return;
  }

  let mismatches = 0;
  for (const row of sample) {
    const sizePrices = row.size_prices as SizePricesMap;
    const minRub = minSizePrice(sizePrices)?.rub ?? null;
    const ok = minRub != null && Number(row.price_rub) === minRub;
    console.log(
      `[verify] spu=${row.poizon_id} sizes=${Object.keys(sizePrices).length} price_rub=${row.price_rub} minRub=${minRub} ${ok ? "OK" : "MISMATCH"}`,
    );
    if (!ok) mismatches++;
  }

  if (mismatches > 0) {
    console.warn(`[verify] ${mismatches} mismatch(es) в spot-check`);
    process.exit(1);
  }

  console.log("[verify] Spot-check пройден: price_rub = min(size_prices.rub)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
