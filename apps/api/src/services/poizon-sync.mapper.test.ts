import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoisonProductRaw } from "./poizon.provider.js";
import { mapPoizonItemToUpsertRow } from "./poizon-sync.service.js";
import type { PricingConfig } from "./pricing.service.js";

const config: PricingConfig = {
  rate_cny_rub: 10,
  rate_cny_usd: 7,
  markup_percent: 0,
  delivery_fee: 0,
};

describe("mapPoizonItemToUpsertRow", () => {
  it("stores english name and per-size prices", () => {
    const item: PoisonProductRaw = {
      spuId: 1,
      title: "耐克 Dunk",
      englishTitle: "Nike Dunk Low",
      brand: "Nike",
      logoUrl: "",
      priceFen: 450000,
      inStock: true,
      images: ["https://img.test/1.jpg"],
      sizes: { "42": true, "43": true, "44": false },
      sizePricesFen: { "42": 450000, "43": 480000 },
      soldCount: 10,
    };

    const row = mapPoizonItemToUpsertRow(item, config);
    assert.equal(row.name, "Nike Dunk Low");
    assert.equal(row.price_rub, 45000);
    assert.equal(row.size_prices["43"].rub, 48000);
    assert.equal(row.stock["44"], false);
    assert.deepEqual(row.sizes.EU.sort(), ["42", "43", "44"]);
  });

  it("falls back to default EU sizes when no sku data", () => {
    const item: PoisonProductRaw = {
      spuId: 2,
      title: "Mock",
      englishTitle: "Mock Product",
      brand: "Nike",
      logoUrl: "",
      priceFen: 450000,
      inStock: true,
      images: [],
      sizes: {},
      sizePricesFen: {},
      soldCount: 0,
    };

    const row = mapPoizonItemToUpsertRow(item, config);
    assert.equal(row.sizes.EU.length, 8);
    assert.deepEqual(Object.keys(row.size_prices), []);
  });
});
