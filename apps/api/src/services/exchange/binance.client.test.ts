import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { fetchUsdtRubFromBinance } from "./binance.client.js";

describe("fetchUsdtRubFromBinance", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses USDTRUB price", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ symbol: "USDTRUB", price: "92.50" }),
    })) as typeof fetch;

    const rate = await fetchUsdtRubFromBinance();
    assert.equal(rate, 92.5);
  });

  it("throws on invalid price", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ symbol: "USDTRUB", price: "0" }),
    })) as typeof fetch;

    await assert.rejects(() => fetchUsdtRubFromBinance());
  });
});
