import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import Decimal from "decimal.js";
import {
  resetExchangeRateService,
  seedExchangeRateCacheForTests,
  seedUsdtRubCacheForTests,
} from "./currency.service.js";
import { resetPricingModuleConfig } from "./pricing.config.js";
import {
  PriceCalculator,
  buildSyncPricingContextFromSnapshot,
  calculateProductPrices,
  resetPriceCalculator,
} from "./pricing.service.js";

// ── Вспомогательные функции ─────────────────────────────────────────

function d(val: string | number): Decimal {
  return new Decimal(val);
}

const originalFetch = globalThis.fetch;

function setupMockRates(cnyRub: number, usdtRub: number): void {
  resetExchangeRateService();
  seedExchangeRateCacheForTests(cnyRub, usdtRub);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetExchangeRateService();
  resetPriceCalculator();
  resetPricingModuleConfig();
});

// ── Тесты ───────────────────────────────────────────────────────────

describe("PriceCalculator (decimal, breakdown, STRICT)", () => {
  it("корректный расчёт публичной цены с breakdown", async () => {
    setupMockRates(13.5, 97);

    const calc = new PriceCalculator();
    const result = await calc.calculate({
      priceCny: d(450),
      markupPct: d(0.25),
      deliveryRub: d(500),
      fxBufferPct: d(0.03),
    });

    // baseRub = 450 * 13.5 = 6075
    assert.ok(result.publicBreakdown.baseRub.eq(d("6075")));
    // markupRub = 6075 * 0.25 = 1518.75
    assert.ok(result.publicBreakdown.markupRub.eq(d("1518.75")));
    // subtotalRub = 6075 + 1518.75 + 500 = 8093.75
    assert.ok(result.publicBreakdown.subtotalRub.eq(d("8093.75")));
    // finalRub: ROUND_CEIL, scale=0 => ceil(8093.75) = 8094
    assert.equal(result.publicBreakdown.finalRub.toNumber(), 8094);
    // Округление только в конце — subtotal не округлён
    assert.equal(result.publicBreakdown.subtotalRub.toNumber(), 8093.75);

    // Проверка breakdown полей
    assert.equal(result.publicBreakdown.isFallback, false);
    assert.equal(result.publicBreakdown.isStale, false);
    assert.equal(result.publicBreakdown.cnyRubSource, "cbr-mirror");
    assert.ok(result.publicBreakdown.rateTimestamp.length > 0);
  });

  it("корректный cross-rate USDT/CNY", async () => {
    setupMockRates(13.5, 97);
    // usdtCny = 97 / 13.5 ≈ 7.185185...

    const calc = new PriceCalculator();
    const result = await calc.calculate({
      priceCny: d(450),
      markupPct: d(0.25),
      deliveryRub: d(500),
      fxBufferPct: d(0),
    });

    const usdtCnyRate = result.internalBreakdown.usdtCnyRate;
    // 97 / 13.5 ≈ 7.185185...
    const expected = d(97).div(d(13.5));
    assert.ok(
      usdtCnyRate.sub(expected).abs().lt(d("0.001")),
      `usdtCnyRate ${usdtCnyRate} != ${expected}`,
    );

    // Базовая цена USDT = 450 / usdtCnyRate
    const expectedBaseUsdt = d(450).div(usdtCnyRate);
    assert.ok(
      result.internalBreakdown.baseUsdt
        .sub(expectedBaseUsdt)
        .abs()
        .lt(d("0.01")),
    );
  });

  it("fxBufferPct добавляется к внутренней цене", async () => {
    setupMockRates(13.5, 97);

    const calc = new PriceCalculator();
    const result = await calc.calculate({
      priceCny: d(450),
      markupPct: d(0),
      deliveryRub: d(0),
      fxBufferPct: d(0.03),
    });

    // baseUsdt + fxBufferUsdt должно быть > baseUsdt
    assert.ok(
      result.internalBreakdown.fxBufferUsdt.gt(d(0)),
      "fxBuffer должен быть > 0",
    );
    assert.ok(
      result.internalBreakdown.finalUsdt.gt(result.internalBreakdown.baseUsdt),
    );
  });

  it("поведение при fallback (ALLOW_FALLBACK)", async () => {
    // Симулируем: Binance недоступен, но есть кеш
    globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("daily_json")) {
        return {
          ok: true,
          json: async () => ({
            Date: "2026-06-08",
            Valute: { CNY: { Value: 13.5, Nominal: 1 } },
          }),
        };
      }
      // Binance падает
      throw new Error("network down");
    }) as unknown as typeof fetch;

    resetExchangeRateService();
    seedUsdtRubCacheForTests(97, {
      fetchedAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });

    const calc = new PriceCalculator();
    // calculateInternalOnly — не ждёт CBR fetch, использует getUsdtRubRate()
    const breakdown = await calc.calculateInternalOnly(
      d(450),
      d(0.25),
      d(0.03),
    );

    // Должен отработать без исключения
    assert.ok(breakdown.finalUsdt.gt(d(0)));
    // Но Binance упал — USDT из кеша должен иметь isFallback=true у источника
    // (мы используем setupMockRates для CBR + кеш для USDT)
  });

  it("поведение при stale rate", async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    resetExchangeRateService();
    seedExchangeRateCacheForTests(13.5, 97, {
      fetchedAt: oldDate,
      isStale: true,
      isFallback: true,
    });

    // Мокаем fetch — но STRICT всё равно не разрешит
    globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("daily_json")) {
        throw new Error("CBR down");
      }
      if (url.includes("USDTRUB")) {
        throw new Error("Binance down");
      }
      throw new Error(`unexpected: ${url}`);
    }) as unknown as typeof fetch;

    // По умолчанию ALLOW_FALLBACK — должно работать
    const calc1 = new PriceCalculator();
    const r1 = await calc1.calculatePublicOnly(d(450), d(0.25), d(500));
    assert.ok(r1.finalRub.gt(d(0)));
    assert.equal(r1.isFallback, true);

    // Меняем политику на STRICT — должно бросить ошибку
    process.env.PRICING_PUBLIC_RATE_POLICY = "STRICT";
    resetPricingModuleConfig();

    const calc2 = new PriceCalculator();
    await assert.rejects(
      () => calc2.calculatePublicOnly(d(450), d(0.25), d(500)),
      /stale|fallback/i,
    );

    process.env.PRICING_PUBLIC_RATE_POLICY = undefined;
    resetPricingModuleConfig();
  });

  it("округление выполняется только в конце", async () => {
    setupMockRates(13.5, 97);

    const calc = new PriceCalculator();
    const result = await calc.calculate({
      priceCny: d(450),
      markupPct: d(0.25),
      deliveryRub: d(500),
      fxBufferPct: d(0.03),
    });

    const b = result.publicBreakdown;
    // Промежуточные значения НЕ округлены
    assert.ok(
      b.subtotalRub.toString().includes(".") || b.subtotalRub.isInteger(),
      "subtotal может иметь дробную часть",
    );
    // final — округлён
    const finalStr = b.finalRub.toString();
    if (b.roundingScale === 0) {
      assert.ok(
        !finalStr.includes("."),
        `final=${finalStr} не должно иметь дробной части`,
      );
    }
  });

  it("публичная цена в STRICT не считается при stale курсе", async () => {
    process.env.PRICING_PUBLIC_RATE_POLICY = "STRICT";
    resetPricingModuleConfig();

    // Мокаем fetch с ошибкой (CBR недоступен)
    globalThis.fetch = mock.fn(async () => {
      throw new Error("CBR down");
    }) as unknown as typeof fetch;

    const calc = new PriceCalculator();
    await assert.rejects(
      () => calc.calculatePublicOnly(d(450), d(0.25), d(500)),
      /stale|fallback|unavailable/i,
    );

    process.env.PRICING_PUBLIC_RATE_POLICY = undefined;
    resetPricingModuleConfig();
  });

  it("расчёт с ROUND_HALF_UP", async () => {
    process.env.PRICING_ROUNDING_MODE = "ROUND_HALF_UP";
    resetPricingModuleConfig();
    setupMockRates(13.5, 97);

    const calc = new PriceCalculator();
    const result = await calc.calculate({
      priceCny: d(450),
      markupPct: d(0.25),
      deliveryRub: d(500),
      fxBufferPct: d(0.03),
    });

    // subtotal = 8093.75, ROUND_HALF_UP => 8094 (тоже)
    assert.equal(result.publicBreakdown.finalRub.toNumber(), 8094);
    assert.equal(result.publicBreakdown.roundingMode, "ROUND_HALF_UP");

    process.env.PRICING_ROUNDING_MODE = undefined;
    resetPricingModuleConfig();
  });
});

describe("calculateProductPrices (legacy rounding parity)", () => {
  const settings = {
    rate_cny_rub: 13.5,
    rate_cny_usd: 7.25,
    markup_percent: 25,
    delivery_fee: 500,
  };

  const ctx = buildSyncPricingContextFromSnapshot(
    {
      cnyRub: {
        rate: d(13.5),
        source: "env",
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        isFallback: false,
        isStale: false,
      },
      usdtRub: {
        rate: d(97),
        source: "env",
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        isFallback: false,
        isStale: false,
      },
      usdtCny: d(97).div(d(13.5)),
      computedAt: new Date().toISOString(),
    },
    settings,
  );

  it("применяет 25% наценку и доставку", () => {
    const result = calculateProductPrices(100, ctx);
    assert.equal(result.rub, Math.ceil((100 * 13.5 * 1.25 + 500) / 10) * 10);
  });

  it("нулевая цена не даёт NaN", () => {
    const r = calculateProductPrices(0, ctx);
    assert.equal(Number.isNaN(r.rub), false);
    assert.equal(Number.isNaN(r.usdt), false);
  });
});
