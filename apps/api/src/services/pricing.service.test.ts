import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculatePrices } from "./pricing.service.js";

const config = {
  rate_cny_rub: 13.5,
  rate_cny_usd: 7.25,
  markup_percent: 25,
  delivery_fee: 500,
};

describe("PricingService.calculatePrices", () => {
  it("applies 25% markup and delivery", () => {
    const result = calculatePrices(100, config);
    assert.equal(result.rub, Math.ceil((100 * 13.5 * 1.25 + 500) / 10) * 10);
  });

  it("zero price does not produce NaN", () => {
    const r = calculatePrices(0, config);
    assert.equal(Number.isNaN(r.rub), false);
    assert.equal(Number.isNaN(r.usdt), false);
  });
});
