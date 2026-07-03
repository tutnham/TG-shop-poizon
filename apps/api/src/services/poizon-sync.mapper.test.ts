import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Decimal from "decimal.js";
import { mapPoizonItemToUpsertRow } from "./poizon-sync.service.js";
import type { PoisonProductRaw } from "./poizon.provider.js";
import type { SyncPricingContext } from "./pricing.service.js";

const ctx: SyncPricingContext = {
  rateCnyRub: new Decimal(10),
  rateCnyUsd: new Decimal(7),
  markupPercent: new Decimal(0),
  deliveryFee: new Decimal(0),
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

    const row = mapPoizonItemToUpsertRow(item, ctx);
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

    const row = mapPoizonItemToUpsertRow(item, ctx);
    assert.equal(row.sizes.EU.length, 8);
    assert.deepEqual(Object.keys(row.size_prices), []);
  });
});
