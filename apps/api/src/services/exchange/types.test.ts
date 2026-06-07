import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExchangeRates } from "./types.js";

describe("buildExchangeRates", () => {
  it("computes rate_cny_usd as usdt_rub / cny_rub", () => {
    const rates = buildExchangeRates(13.5, 98, {
      cny_rub: "cbr",
      usdt_rub: "binance",
    });
    assert.ok(Math.abs(rates.rate_cny_usd - 98 / 13.5) < 0.0001);
    assert.ok(Math.abs(rates.cny_per_usdt - 13.5 / 98) < 0.0001);
  });
});
