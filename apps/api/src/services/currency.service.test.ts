import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { buildExchangeRates } from "./exchange/types.js";

describe("Exchange rate formula (pricing compatibility)", () => {
  it("price_usdt = price_cny / rate_cny_usd matches rub chain", () => {
    const cny_rub = 13.5;
    const usdt_rub = 98;
    const rates = buildExchangeRates(cny_rub, usdt_rub, {
      cny_rub: "cbr",
      usdt_rub: "binance",
    });
    const priceCny = 100;
    const usdtViaFormula = priceCny / rates.rate_cny_usd;
    const rubValue = priceCny * cny_rub;
    const usdtViaRub = rubValue / usdt_rub;
    assert.ok(Math.abs(usdtViaFormula - usdtViaRub) < 0.01);
  });
});

describe("fetchLiveRates integration (mocked fetch)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("CBR JSON + Binance produce valid rates", async () => {
    globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("daily_json")) {
        return {
          ok: true,
          json: async () => ({
            Date: "2026-06-02",
            Valute: {
              CNY: { Value: 13.4521, Nominal: 1 },
            },
          }),
        };
      }
      if (url.includes("USDTRUB")) {
        return {
          ok: true,
          json: async () => ({ symbol: "USDTRUB", price: "92.10" }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const { fetchCnyRubFromCbr } = await import("./exchange/cbr.client.js");
    const { fetchUsdtRubFromBinance } = await import(
      "./exchange/binance.client.js"
    );
    const cbr = await fetchCnyRubFromCbr();
    const usdt = await fetchUsdtRubFromBinance();
    const rates = buildExchangeRates(cbr.rate, usdt, {
      cny_rub: "cbr",
      usdt_rub: "binance",
    });
    assert.equal(rates.cny_rub, 13.4521);
    assert.equal(rates.usdt_rub, 92.1);
    assert.ok(rates.rate_cny_usd > 6);
  });
});

describe("refreshRates fallback", () => {
  const originalFetch = globalThis.fetch;
  const env = process.env;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns env fallback when live fetch fails and DB is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    globalThis.fetch = mock.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    process.env.CNY_TO_RUB_RATE = "11";
    process.env.CNY_TO_USD_RATE = "7";

    const { refreshRates } = await import("./currency.service.js");
    const rates = await refreshRates(true);
    assert.equal(rates.cny_rub, 11);
    assert.equal(rates.usdt_rub, 77);
    assert.equal(rates.sources.cny_rub, "env");
    assert.equal(rates.sources.usdt_rub, "env");
  });
});

describe("persistRates", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("no-ops when Supabase is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { persistRates } = await import("./currency.service.js");
    const { buildExchangeRates } = await import("./exchange/types.js");
    const rates = buildExchangeRates(13, 95, {
      cny_rub: "cbr",
      usdt_rub: "binance",
    });
    await assert.doesNotReject(() => persistRates(rates));
  });

});
