/**
 * Бэкфилл английских названий и цен по размерам для существующих товаров.
 *
 * Использование:
 *   npx tsx scripts/backfill-size-prices.ts [--limit=100] [--offset=0]
 */
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { getSupabase } from "../src/db/client.js";
import { mapPoizonItemToUpsertRow } from "../src/services/poizon-sync.service.js";
import { getPoisonProvider } from "../src/services/poizon.service.js";
import { refreshRates } from "../src/services/currency.service.js";
import { getPricingConfig } from "../src/services/pricing.service.js";

loadDotEnv();

const DELAY_MS = 900;
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const offsetArg = args.find((a) => a.startsWith("--offset="));
const LIMIT = Number(limitArg?.split("=")[1] ?? "200");
const OFFSET = Number(offsetArg?.split("=")[1] ?? "0");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  await refreshRates(true);
  const config = await getPricingConfig({ skipRatesRefresh: true });
  const provider = getPoisonProvider();

  const { data, error } = await getSupabase()
    .from("products")
    .select("id, poizon_id")
    .eq("source", "poizon")
    .order("updated_at", { ascending: true })
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  console.log(
    `[backfill] Обрабатываем ${rows.length} товаров (offset=${OFFSET}, limit=${LIMIT})`,
  );

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const spuId = Number(row.poizon_id);
    if (!Number.isFinite(spuId) || spuId <= 0) {
      failed++;
      continue;
    }

    try {
      const detail = await provider.getProductDetail(spuId);
      if (!detail) {
        failed++;
        continue;
      }

      const upsertRow = mapPoizonItemToUpsertRow(detail, config);
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
          `[backfill] ${i + 1}/${rows.length} | updated=${updated} failed=${failed}`,
        );
      }
    } catch (e) {
      failed++;
      console.warn(
        `[backfill] spuId=${row.poizon_id}:`,
        (e as Error).message,
      );
    }

    if (i < rows.length - 1) await sleep(DELAY_MS);
  }

  console.log(`[backfill] Готово: updated=${updated}, failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
