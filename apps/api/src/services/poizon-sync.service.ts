import { getSupabase } from "../db/client.js";
import { setConfigValue } from "../db/config.repository.js";
import * as productRepo from "../db/product.repository.js";
import { getPoisonProvider } from "./poizon.service.js";
import { calculatePricesFromFen, getPricingConfig } from "./pricing.service.js";

const SYNC_KEYWORDS = ["nike", "jordan", "adidas", "yeezy", "new balance"];

export async function runFullSync(): Promise<{
  ok: boolean;
  items_synced: number;
  error?: string;
}> {
  const logId = await startSyncLog();
  let items_synced = 0;

  try {
    const config = await getPricingConfig();
    const provider = getPoisonProvider();

    for (const keyword of SYNC_KEYWORDS) {
      const result = await provider.searchProducts(keyword, 10, 0);
      for (const item of result.items) {
        const prices = calculatePricesFromFen(item.priceFen, config);
        await productRepo.upsertProductFromPoizon({
          poizon_id: String(item.spuId),
          name: item.title,
          brand: item.brand,
          category_id: null,
          image_urls: item.images,
          price_cny: prices.cny,
          price_rub: prices.rub,
          price_usdt: prices.usdt,
          sizes: { EU: Object.keys(item.sizes) },
          stock: item.sizes,
          sold_count: item.soldCount,
          is_available: item.inStock,
        });
        items_synced++;
        await sleep(1100);
      }
    }

    await finishSyncLog(logId, "success", items_synced);
    await setConfigValue("last_synced_at", new Date().toISOString());
    return { ok: true, items_synced };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    await finishSyncLog(logId, "error", items_synced, msg);
    return { ok: false, items_synced, error: msg };
  }
}

async function startSyncLog(): Promise<string> {
  const { data, error } = await getSupabase()
    .from("sync_logs")
    .insert({ status: "running", items_synced: 0 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function finishSyncLog(
  id: string,
  status: string,
  items: number,
  error_message?: string,
): Promise<void> {
  await getSupabase()
    .from("sync_logs")
    .update({
      status,
      items_synced: items,
      error_message: error_message ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
