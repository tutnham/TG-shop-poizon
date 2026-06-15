import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSizePricesFromFen,
  minSizePrice,
  resolveProductSizePrice,
} from "./product-pricing.js";
import type { PricingConfig } from "./pricing.service.js";

const config: PricingConfig = {
  rate_cny_rub: 10,
  rate_cny_usd: 7,
  markup_percent: 0,
  delivery_fee: 0,
};

describe("product-pricing", () => {
  it("buildSizePricesFromFen converts each size", () => {
    const map = buildSizePricesFromFen(
      { "42": 450000, "43": 480000 },
      config,
    );
    assert.equal(map["42"].cny, 4500);
    assert.equal(map["42"].rub, 45000);
    assert.equal(map["43"].cny, 4800);
  });

  it("minSizePrice picks lowest rub", () => {
    const map = buildSizePricesFromFen(
      { "42": 450000, "43": 480000 },
      config,
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
