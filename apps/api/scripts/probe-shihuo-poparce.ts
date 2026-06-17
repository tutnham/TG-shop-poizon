/**
 * Пробник цепочки poparce shihuo: search → price
 *   GET /api/shihuo/search?keyword={vendorCode}
 *   GET /api/shihuo/price/{goodsId}
 */
import { loadDotEnv } from "../src/lib/load-dotenv.js";

loadDotEnv();

const API_KEY =
  process.env.POIZON_OFFICIAL_API_KEY || process.env.POIZON_API_KEY || "";
const BASE = process.env.POPARCE_SHIHUO_URL || "https://poparce.ru/api/shihuo";

const KEYWORDS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["586388WHWM19307", "DD1391-100", "DD1391"];

async function fetchJson(
  path: string,
): Promise<{ status: number; json: unknown; text: string }> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    /* non-json */
  }
  return { status: res.status, json, text };
}

function pickSearchHit(data: unknown): {
  goodsId?: string | number;
  styleId?: string | number;
  title?: string;
} | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;

  const lists = [
    root.list,
    root.data,
    root.items,
    root.results,
    (root.result as Record<string, unknown> | undefined)?.list,
  ].filter(Array.isArray) as unknown[][];

  for (const list of lists) {
    const first = list[0];
    if (!first || typeof first !== "object") continue;
    const item = first as Record<string, unknown>;
    return {
      goodsId: (item.goodsId ?? item.goods_id ?? item.id) as
        | string
        | number
        | undefined,
      styleId: (item.styleId ?? item.style_id) as string | number | undefined,
      title: typeof item.title === "string" ? item.title : undefined,
    };
  }
  return null;
}

async function main(): Promise<void> {
  if (!API_KEY) throw new Error("API key not set");

  console.log("Base:", BASE);
  console.log("Keywords:", KEYWORDS.join(", "));

  for (const keyword of KEYWORDS) {
    console.log(`\n=== SEARCH: ${keyword} ===`);
    let search: Awaited<ReturnType<typeof fetchJson>> | null = null;
    for (const param of [
      "keyword",
      "q",
      "query",
      "search",
      "text",
      "article",
      "articleNumber",
      "vendorCode",
    ] as const) {
      const attempt = await fetchJson(
        `/search?${param}=${encodeURIComponent(keyword)}`,
      );
      console.log(`  try ${param}=... -> ${attempt.status}`);
      if (attempt.status === 200) {
        search = attempt;
        break;
      }
      if (attempt.status !== 400) search = attempt;
    }
    if (!search) continue;

    console.log("Status:", search.status);
    console.log("Body preview:", search.text.slice(0, 600));

    const hit = pickSearchHit(search.json);
    if (!hit?.goodsId) {
      console.log("No goodsId in search response");
      continue;
    }

    console.log("Hit:", hit);

    console.log(`\n=== PRICE: goodsId=${hit.goodsId} styleId=${hit.styleId} ===`);
    const priceAttempts = [
      `/price/${hit.goodsId}`,
      `/price/${hit.goodsId}?styleId=${hit.styleId}`,
      `/price?goodsId=${hit.goodsId}`,
      `/price?goodsId=${hit.goodsId}&styleId=${hit.styleId}`,
      `/price/${hit.goodsId}/${hit.styleId}`,
    ];
    for (const p of priceAttempts) {
      const price = await fetchJson(p);
      console.log(`  ${p} -> ${price.status}`, price.text.slice(0, 200));
      if (price.status === 200) {
        const body = price.json as Record<string, unknown> | null;
        if (body && typeof body === "object") {
          console.log("  price keys:", Object.keys(body).join(", "));
          const suppliers = body.suppliers;
          if (Array.isArray(suppliers) && suppliers[0]) {
            console.log(
              "  first supplier keys:",
              Object.keys(suppliers[0] as object).join(", "),
            );
          }
          const sizeList = body.sizes ?? body.sizeList ?? body.skuList;
          if (Array.isArray(sizeList)) {
            console.log("  size entries:", sizeList.length);
            console.log(
              "  sample:",
              JSON.stringify(sizeList.slice(0, 3)).slice(0, 400),
            );
          }
        }
        break;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
