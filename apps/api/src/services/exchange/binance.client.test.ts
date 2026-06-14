import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  fetchUsdtRubFromBinance,
  fetchUsdtRubRateFromBinance,
} from "./binance.client.js";

describe("fetchUsdtRubFromBinance (legacy)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("парсит USDTRUB цену", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ symbol: "USDTRUB", price: "92.50" }),
    })) as unknown as typeof fetch;

    const rate = await fetchUsdtRubFromBinance();
    assert.equal(rate, 92.5);
  });

  it("бросает ошибку при невалидной цене", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ symbol: "USDTRUB", price: "0" }),
    })) as unknown as typeof fetch;

    await assert.rejects(() => fetchUsdtRubFromBinance());
  });
});

describe("fetchUsdtRubRateFromBinance (новый API)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("возвращает ExchangeRate с метаданными", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ symbol: "USDTRUB", price: "92.50" }),
    })) as unknown as typeof fetch;

    const rate = await fetchUsdtRubRateFromBinance();
    assert.equal(rate.rate.toNumber(), 92.5);
    assert.equal(rate.source, "binance");
    assert.equal(rate.isFallback, false);
    assert.equal(rate.isStale, false);
    assert.ok(rate.fetchedAt.length > 0);
    assert.ok(new Date(rate.expiresAt) > new Date(rate.fetchedAt));
    // TTL = 5 минут
    const ttl =
      new Date(rate.expiresAt).getTime() - new Date(rate.fetchedAt).getTime();
    assert.ok(
      ttl >= 4 * 60 * 1000 && ttl <= 6 * 60 * 1000,
      `TTL должен быть ~5 мин, получено ${ttl}мс`,
    );
  });
});
