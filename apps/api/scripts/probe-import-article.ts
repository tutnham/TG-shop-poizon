/**
 * Probe import chain for an article: resolve → Poizon search → Shihuo fallback
 * Usage: npx tsx scripts/probe-import-article.ts IF3909
 */
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { resolvePoizonRef } from "../src/services/poizon-ref-resolver.js";
import { importProductByQuery } from "../src/services/product-import.service.js";
import { getPoisonProvider } from "../src/services/poizon.service.js";
import { getShihuoPoparceProvider } from "../src/services/shihuo-poparce.provider.js";

loadDotEnv();

const keyword = process.argv[2]?.trim() ?? "IF3909";

async function main(): Promise<void> {
  console.log("Keyword:", keyword);
  console.log("Ref:", resolvePoizonRef(keyword));

  const provider = getPoisonProvider();
  console.log("Provider:", provider.constructor.name);

  try {
    const search = await provider.searchProducts(keyword, 20, 0);
    console.log("Poizon search total:", search.total, "items:", search.items.length);
    for (const item of search.items.slice(0, 5)) {
      console.log(
        " - spuId:",
        item.spuId,
        "article:",
        item.articleNumber ?? "(none)",
        "title:",
        item.title.slice(0, 60),
      );
    }
    if (search.items[0]) {
      const spuId = search.items[0].spuId;
      const detail = await provider.getProductDetail(spuId);
      console.log("First hit detail:", detail ? `ok spuId=${detail.spuId}` : "null");
    }
  } catch (e) {
    console.error("Poizon error:", e instanceof Error ? e.message : e);
  }

  try {
    const shihuo = getShihuoPoparceProvider();
    const hit = await shihuo.searchByArticle(keyword);
    console.log("Shihuo search:", hit);
    if (hit) {
      const full = await shihuo.fetchProductFull(hit.goodsId, hit.styleId);
      console.log(
        "Shihuo product-full:",
        full
          ? {
              name: full.name,
              sizes: Object.keys(full.sizePricesCny).length,
              images: full.images.length,
            }
          : null,
      );
    }
  } catch (e) {
    console.error("Shihuo error:", e instanceof Error ? e.message : e);
  }

  try {
    const product = await importProductByQuery(keyword);
    console.log("Import OK:", product.id, product.name, product.price_rub);
  } catch (e) {
    console.error(
      "Import FAIL:",
      e instanceof Error ? `${e.name}: ${e.message}` : e,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
