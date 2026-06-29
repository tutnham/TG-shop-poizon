import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { getPoisonProvider } from "../src/services/poizon.service.js";
import { buildSyncPricingContext } from "../src/services/pricing.service.js";
import { mapPoizonItemToUpsertRow } from "../src/services/poizon-sync.service.js";
import { refreshRates } from "../src/services/currency.service.js";

loadDotEnv();

async function main() {
  await refreshRates(true);
  const ctx = await buildSyncPricingContext();
  const provider = getPoisonProvider();
  const vendorCode = process.argv[2] ?? "1011B721-001";

  const search = await provider.searchProducts(vendorCode, 3, 0);
  console.log("search", search.items.length, search.items[0]?.spuId);
  if (!search.items[0]) return;

  const detail = await provider.getProductDetail(search.items[0].spuId);
  console.log(
    "sizePricesFen",
    Object.keys(detail?.sizePricesFen ?? {}).length,
    detail?.sizePricesFen,
  );

  if (detail) {
    const row = mapPoizonItemToUpsertRow(detail, ctx);
    console.log("size_prices", row.size_prices);
  }
}

main().catch(console.error);
