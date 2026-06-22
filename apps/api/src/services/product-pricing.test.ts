import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Decimal from "decimal.js";
import {
  buildSizePricesFromCny,
  buildSizePricesFromFen,
  minSizePrice,
  resolveProductSizePrice,
} from "./product-pricing.js";
import type { SyncPricingContext } from "./pricing.service.js";

const ctx: SyncPricingContext = {
  rateCnyRub: new Decimal(10),
  rateCnyUsd: new Decimal(7),
  markupPercent: new Decimal(0),
  deliveryFee: new Decimal(0),
};

describe("product-pricing", () => {
  it("buildSizePricesFromFen converts each size", () => {
    const map = buildSizePricesFromFen(
      { "42": 450000, "43": 480000 },
      ctx,
    );
    assert.equal(map["42"].cny, 4500);
    assert.equal(map["42"].rub, 45000);
    assert.equal(map["43"].cny, 4800);
  });

  it("buildSizePricesFromCny converts each size from yuan", () => {
    const map = buildSizePricesFromCny({ "42": 450, "43": 480 }, ctx);
    assert.equal(map["42"].cny, 450);
    assert.equal(map["42"].rub, 4500);
    assert.equal(map["43"].cny, 480);
    assert.equal(map["43"].rub, 4800);
  });

  it("minSizePrice picks lowest rub", () => {
    const map = buildSizePricesFromFen(
      { "42": 450000, "43": 480000 },
      ctx,
    );
    const min = minSizePrice(map);
    assert.ok(min);
    assert.equal(min!.rub, 45000);
  });

  it("resolveProductSizePrice prefers size_prices entry", () => {
    const unit = resolveProductSizePrice(
      {
        price_rub: 1000,
        price_usdt: 10,
        price_cny: 100,
        size_prices: {
          "42": { rub: 45000, usdt: 500, cny: 4500 },
        },
      },
      "42",
    );
    assert.equal(unit.rub, 45000);
  });

  it("resolveProductSizePrice falls back to scalar price", () => {
    const unit = resolveProductSizePrice(
      {
        price_rub: 1000,
        price_usdt: 10,
        price_cny: 100,
        size_prices: {},
      },
      "42",
    );
    assert.equal(unit.rub, 1000);
  });
});
