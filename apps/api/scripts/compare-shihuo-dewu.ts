/**
 * Сравнение /api/dewu vs /api/shihuo productDetailWithPrice
 */
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { parsePoizonDetailResponse } from "../src/services/poizon-detail.parser.js";

loadDotEnv();

const API_KEY =
  process.env.POIZON_OFFICIAL_API_KEY || process.env.POIZON_API_KEY || "";
const SPU_ID = Number(process.argv[2] || "81971");

async function test(label: string, url: string): Promise<void> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    console.log(`\n=== ${label} ===`);
    console.log("URL:", url);
    console.log(
      "Status:",
      res.status,
      res.statusText,
      `(${Date.now() - t0}ms)`,
    );
    console.log("x-trace-id:", res.headers.get("x-trace-id") ?? "-");

    if (!res.ok) {
      console.log("Body:", text.slice(0, 400));
      return;
    }

    const json = JSON.parse(text) as unknown;
    const root =
      json && typeof json === "object" && "result" in json
        ? (json as { result: Record<string, unknown> }).result
        : (json as Record<string, unknown>);

    const hasSkus = Array.isArray(root.skus) ? root.skus.length : 0;
    const hasSkuList = Array.isArray(root.skuList) ? root.skuList.length : 0;
    console.log("skus[]:", hasSkus, "| skuList[]:", hasSkuList);

    const parsed = parsePoizonDetailResponse(json, SPU_ID);
    if (parsed) {
      const sizes = Object.keys(parsed.sizePricesFen);
      console.log("Parsed sku prices:", sizes.length);
      console.log("Sample sizes:", sizes.slice(0, 8).join(", ") || "(none)");
      console.log("Min price fen:", parsed.priceFen);
      console.log("Title:", parsed.englishTitle.slice(0, 80));
    } else {
      console.log("parsePoizonDetailResponse: null");
      console.log("Top keys:", Object.keys(root).slice(0, 15).join(", "));
    }
  } catch (e) {
    console.log(`${label} ERROR:`, (e as Error).message);
  }
}

async function main(): Promise<void> {
  if (!API_KEY) throw new Error("API key not set");
  const base = "https://poizon-api.com/api";
  await test(
    "dewu productDetailWithPrice",
    `${base}/dewu/productDetailWithPrice?spuId=${SPU_ID}`,
  );
  await test(
    "shihuo productDetailWithPrice",
    `${base}/shihuo/productDetailWithPrice?spuId=${SPU_ID}`,
  );
  await test(
    "dewu productDetail",
    `${base}/dewu/productDetail?spuId=${SPU_ID}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
