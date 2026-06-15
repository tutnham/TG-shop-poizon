/**
 * Пробник Poizon API: проверяет, какие поля реально возвращает ключ.
 *
 * Использование:
 *   npx tsx scripts/probe-poizon-api.ts [spuId]
 */
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import {
  mapDetailWithPriceSkus,
  mapGoodsInfoSkuList,
  resolveEnglishTitle,
} from "../src/services/poizon-sku.mapper.js";

loadDotEnv();

const API_KEY =
  process.env.POIZON_OFFICIAL_API_KEY || process.env.POIZON_API_KEY || "";
const BASE_URL =
  process.env.POIZON_OFFICIAL_API_URL ||
  process.env.POIZON_API_BASE_URL ||
  "https://poizon-api.com/api/dewu";
const SPU_ID = Number(process.argv[2] || process.env.PROBE_SPU_ID || "81971");

if (!API_KEY) {
  console.error("POIZON_OFFICIAL_API_KEY или POIZON_API_KEY не задан");
  process.exit(1);
}

async function fetchJson(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path}: ${res.status} ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as unknown;
}

function summarize(label: string, data: unknown): void {
  console.log(`\n=== ${label} ===`);
  if (!data || typeof data !== "object") {
    console.log("empty response");
    return;
  }

  const root = data as Record<string, unknown>;
  const payload =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root;

  const distSpuTitle =
    typeof payload.distSpuTitle === "string" ? payload.distSpuTitle : null;
  const detail =
    payload.detail && typeof payload.detail === "object"
      ? (payload.detail as Record<string, unknown>)
      : null;
  const title =
    typeof detail?.title === "string"
      ? detail.title
      : typeof payload.dwSpuTitle === "string"
        ? payload.dwSpuTitle
        : null;

  const englishTitle = resolveEnglishTitle({
    distSpuTitle,
    structureTitle:
      typeof detail?.structureTitle === "string"
        ? detail.structureTitle
        : null,
    originalTitle:
      typeof detail?.originalTitle === "string"
        ? detail.originalTitle
        : null,
    title,
    brand: typeof detail?.sourceName === "string" ? detail.sourceName : null,
    articleNumber:
      typeof detail?.articleNumber === "string"
        ? detail.articleNumber
        : null,
  });

  console.log("englishTitle:", englishTitle);

  if (Array.isArray(payload.skuList)) {
    const mapped = mapGoodsInfoSkuList(
      payload.skuList as Parameters<typeof mapGoodsInfoSkuList>[0],
    );
    console.log("format: goodsInfo.skuList");
    console.log("sizes:", mapped.sizes.slice(0, 8).join(", "));
    console.log(
      "sample prices (fen):",
      Object.entries(mapped.sizePricesFen).slice(0, 5),
    );
    return;
  }

  if (Array.isArray(payload.skus)) {
    const mapped = mapDetailWithPriceSkus(
      payload.skus as Parameters<typeof mapDetailWithPriceSkus>[0],
    );
    console.log("format: productDetailWithPrice.skus");
    console.log("sizes:", mapped.sizes.slice(0, 8).join(", "));
    console.log(
      "sample prices (fen):",
      Object.entries(mapped.sizePricesFen).slice(0, 5),
    );
    return;
  }

  console.log("keys:", Object.keys(payload).join(", "));
}

async function main(): Promise<void> {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`SPU ID: ${SPU_ID}`);

  for (const path of [
    `/productDetailWithPrice?spuId=${SPU_ID}`,
    `/productDetail?spuId=${SPU_ID}`,
  ]) {
    try {
      const data = await fetchJson(path);
      summarize(path, data);
    } catch (e) {
      console.error(`\n=== ${path} ===`);
      console.error((e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
