import Decimal from "decimal.js";
import type { Result } from "@poizon-shop/shared";
import { getSupabase } from "../db/client.js";
import { appError } from "../types/app-error.types.js";
import { getEnvOptional } from "../types/env.types.js";
import { getExchangeRateService } from "./currency.service.js";
import { getPricingModuleConfig } from "./pricing.config.js";
import type {
  CalculationBreakdown,
  PriceCalculationInput,
  PriceCalculationResult,
  UsdtCalculationBreakdown,
} from "./exchange/rate-types.js";
import { RateStaleError, RateUnavailableError } from "./exchange/rate-types.js";

// ── Обратно-совместимый конфиг (будет удалён при полном переходе) ────
export interface PricingConfig {
  rate_cny_rub: number;
  rate_cny_usd: number;
  markup_percent: number;
  delivery_fee: number;
}

// ── PriceCalculator ─────────────────────────────────────────────────

export class PriceCalculator {
  /**
   * Рассчитать публичную цену товара (RUB) и внутреннюю цену (USDT).
   *
   * Публичная цена: цена из ЦБ РФ (CNY→RUB) + наценка + доставка.
   * Внутренняя цена: через кросс-курс USDT/CNY + наценка + fxBuffer.
   */
  async calculate(input: PriceCalculationInput): Promise<PriceCalculationResult> {
    const config = getPricingModuleConfig();
    const rateService = getExchangeRateService();
    const snapshot = await rateService.getRateSnapshot();

    // Проверка политик
    rateService.validateRateForPolicy(
      snapshot.cnyRub,
      config.publicRatePolicy,
      "cny_rub",
    );
    rateService.validateRateForPolicy(
      snapshot.usdtRub,
      config.internalRatePolicy,
      "usdt_rub",
    );

    // Публичный расчёт
    const publicBreakdown = this._calculatePublic(
      input.priceCny,
      input.markupPct,
      input.deliveryRub,
      snapshot.cnyRub.rate,
      snapshot.cnyRub.source,
      snapshot.cnyRub.fetchedAt,
      snapshot.cnyRub.isFallback,
      snapshot.cnyRub.isStale,
      config.roundingMode,
      config.roundingScale,
    );

    // Внутренний USDT-расчёт
    const usdtCnyRate = snapshot.usdtRub.rate.div(snapshot.cnyRub.rate);
    const internalBreakdown = this._calculateInternal(
      input.priceCny,
      input.markupPct,
      input.fxBufferPct,
      snapshot.usdtRub.rate,
      snapshot.cnyRub.rate,
      usdtCnyRate,
      snapshot.usdtRub.fetchedAt,
      snapshot.cnyRub.fetchedAt,
      snapshot.usdtRub.isStale || snapshot.cnyRub.isStale,
      {
        usdtRub: snapshot.usdtRub.source as UsdtCalculationBreakdown["sources"]["usdtRub"],
        cnyRub: snapshot.cnyRub.source as UsdtCalculationBreakdown["sources"]["cnyRub"],
      },
    );

    return {
      publicPriceRub: publicBreakdown.finalRub,
      internalPriceUsdt: internalBreakdown.finalUsdt,
      publicBreakdown,
      internalBreakdown,
    };
  }

  /**
   * Рассчитать только публичную цену (без USDT).
   * Быстрее, чем полный calculate(), т.к. не ждёт Binance.
   */
  async calculatePublicOnly(
    priceCny: Decimal,
    markupPct: Decimal,
    deliveryRub: Decimal,
  ): Promise<CalculationBreakdown> {
    const config = getPricingModuleConfig();
    const rateService = getExchangeRateService();
    const cnyRub = await rateService.getCnyRubRate();

    rateService.validateRateForPolicy(cnyRub, config.publicRatePolicy, "cny_rub");

    return this._calculatePublic(
      priceCny,
      markupPct,
      deliveryRub,
      cnyRub.rate,
      cnyRub.source,
      cnyRub.fetchedAt,
      cnyRub.isFallback,
      cnyRub.isStale,
      config.roundingMode,
      config.roundingScale,
    );
  }

  /**
   * Рассчитать кросс-курс USDT→CNY и внутреннюю цену.
   */
  async calculateInternalOnly(
    priceCny: Decimal,
    markupPct: Decimal,
    fxBufferPct: Decimal,
  ): Promise<UsdtCalculationBreakdown> {
    const config = getPricingModuleConfig();
    const rateService = getExchangeRateService();
    const snapshot = await rateService.getRateSnapshot();

    rateService.validateRateForPolicy(
      snapshot.usdtRub,
      config.internalRatePolicy,
      "usdt_rub",
    );

    const usdtCnyRate = snapshot.usdtRub.rate.div(snapshot.cnyRub.rate);
    return this._calculateInternal(
      priceCny,
      markupPct,
      fxBufferPct,
      snapshot.usdtRub.rate,
      snapshot.cnyRub.rate,
      usdtCnyRate,
      snapshot.usdtRub.fetchedAt,
      snapshot.cnyRub.fetchedAt,
      snapshot.usdtRub.isStale || snapshot.cnyRub.isStale,
      {
        usdtRub: snapshot.usdtRub.source as UsdtCalculationBreakdown["sources"]["usdtRub"],
        cnyRub: snapshot.cnyRub.source as UsdtCalculationBreakdown["sources"]["cnyRub"],
      },
    );
  }

  // ── Приватные методы расчёта ──────────────────────────────────────

  private _calculatePublic(
    priceCny: Decimal,
    markupPct: Decimal,
    deliveryRub: Decimal,
    cnyRubRate: Decimal,
    cnyRubSource: CalculationBreakdown["cnyRubSource"],
    rateTimestamp: string,
    isFallback: boolean,
    isStale: boolean,
    roundingMode: CalculationBreakdown["roundingMode"],
    roundingScale: number,
  ): CalculationBreakdown {
    // Все промежуточные шаги — в Decimal, без округления
    const baseRub = priceCny.mul(cnyRubRate);
    const markupRub = baseRub.mul(markupPct);
    const subtotalRub = baseRub.plus(markupRub).plus(deliveryRub);

    // Единственное округление — в самом конце
    const finalRub = this._round(subtotalRub, roundingMode, roundingScale);

    return {
      priceCny,
      cnyRubRate,
      cnyRubSource,
      baseRub,
      markupPct,
      markupRub,
      deliveryRub,
      subtotalRub,
      finalRub,
      roundingMode,
      roundingScale,
      rateTimestamp,
      isFallback,
      isStale,
    };
  }

  private _calculateInternal(
    priceCny: Decimal,
    markupPct: Decimal,
    fxBufferPct: Decimal,
    usdtRubRate: Decimal,
    cnyRubRate: Decimal,
    usdtCnyRate: Decimal,
    usdtRubTimestamp: string,
    cnyRubTimestamp: string,
    isStale: boolean,
    sources: UsdtCalculationBreakdown["sources"],
  ): UsdtCalculationBreakdown {
    // priceCny / usdtCnyRate → базовая цена в USDT
    const baseUsdt = priceCny.div(usdtCnyRate);
    const markupUsdt = baseUsdt.mul(markupPct);
    const fxBufferUsdt = baseUsdt.mul(fxBufferPct);
    const finalUsdt = baseUsdt.plus(markupUsdt).plus(fxBufferUsdt);

    // Округляем USDT до 2 знаков (для отображения)
    const roundedFinalUsdt = this._round(finalUsdt, "ROUND_HALF_UP", 2);

    return {
      usdtRubRate,
      cnyRubRate,
      usdtCnyRate,
      priceCny,
      baseUsdt,
      markupUsdt,
      fxBufferUsdt,
      finalUsdt: roundedFinalUsdt,
      usdtRubTimestamp,
      cnyRubTimestamp,
      isStale,
      sources,
    };
  }

  /** Округление по стратегии, один раз в конце */
  private _round(
    value: Decimal,
    mode: "ROUND_HALF_UP" | "ROUND_CEIL",
    scale: number,
  ): Decimal {
    const rounding =
      mode === "ROUND_HALF_UP"
        ? Decimal.ROUND_HALF_UP
        : Decimal.ROUND_CEIL;
    return value.toDecimalPlaces(scale, rounding);
  }
}

// ── Singleton ───────────────────────────────────────────────────────
let _calculator: PriceCalculator | null = null;

export function getPriceCalculator(): PriceCalculator {
  if (!_calculator) _calculator = new PriceCalculator();
  return _calculator;
}

export function resetPriceCalculator(): void {
  _calculator = null;
}

// ── Обратная совместимость: старые функции ──────────────────────────

/** @deprecated Используйте PriceCalculator */
export function calculatePrices(
  priceCny: number,
  config: PricingConfig,
): { rub: number; usdt: number } {
  if (priceCny < 0) throw new Error("Invalid price");
  const rubBase = priceCny * config.rate_cny_rub;
  const rubWithMarkup =
    rubBase * (1 + config.markup_percent / 100) + config.delivery_fee;
  const usdtBase = priceCny / config.rate_cny_usd;
  const usdtWithMarkup = usdtBase * (1 + config.markup_percent / 100);
  return {
    rub: Math.ceil(rubWithMarkup / 10) * 10,
    usdt: Math.ceil(usdtWithMarkup * 10) / 10,
  };
}

/** @deprecated Используйте PriceCalculator */
export function calculatePricesFromFen(
  priceFen: number,
  config: PricingConfig,
): { rub: number; usdt: number; cny: number } {
  const cny = priceFen / 100;
  const prices = calculatePrices(cny, config);
  return { ...prices, cny };
}

/** @deprecated Используйте PriceCalculator */
export async function calculatePricesAsync(
  priceCny: number,
): Promise<Result<{ rub: number; usdt: number }>> {
  try {
    const config = await getPricingConfig();
    if (config.markup_percent < 0) {
      return {
        ok: false,
        error: appError("Invalid markup", 400, "INVALID_MARKUP"),
      };
    }
    return { ok: true, data: calculatePrices(priceCny, config) };
  } catch (e) {
    return {
      ok: false,
      error: appError(e instanceof Error ? e.message : "Pricing error", 500),
    };
  }
}

/** @deprecated Используйте PriceCalculator */
export async function getPricingConfig(options?: {
  skipRatesRefresh?: boolean;
}): Promise<PricingConfig> {
  const { refreshRates, CACHE_TTL_MS } = await import("./currency.service.js");

  let { data } = await getSupabase()
    .from("pricing_config")
    .select(
      "rate, rate_cny_usdt, markup_percent, delivery_fee, rates_updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isStale = (updatedAt: string | null | undefined): boolean => {
    if (!updatedAt) return true;
    return Date.now() - new Date(updatedAt).getTime() > CACHE_TTL_MS;
  };

  if (!options?.skipRatesRefresh && isStale(data?.rates_updated_at)) {
    await refreshRates();
    const { data: fresh } = await getSupabase()
      .from("pricing_config")
      .select(
        "rate, rate_cny_usdt, markup_percent, delivery_fee, rates_updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fresh) data = fresh;
  }

  const rateCnyRub = Number(
    data?.rate ?? getEnvOptional("CNY_TO_RUB_RATE", "13.5"),
  );
  const rateCnyUsd = Number(
    data?.rate_cny_usdt ?? getEnvOptional("CNY_TO_USD_RATE", "7.25"),
  );
  return {
    rate_cny_rub:
      Number.isFinite(rateCnyRub) && rateCnyRub > 0 ? rateCnyRub : 13.5,
    rate_cny_usd:
      Number.isFinite(rateCnyUsd) && rateCnyUsd > 0 ? rateCnyUsd : 7.25,
    markup_percent: Number(
      data?.markup_percent ?? getEnvOptional("MARKUP_PERCENT", "25"),
    ),
    delivery_fee: Number(
      data?.delivery_fee ?? getEnvOptional("DELIVERY_RUB", "500"),
    ),
  };
}

/** @deprecated Используйте PriceCalculator */
export async function setMarkup(
  percent: number,
  deliveryFee?: number,
): Promise<void> {
  if (!Number.isFinite(percent) || percent < 0 || percent > 1000) {
    throw new Error("Invalid markup percent");
  }
  const patch: Record<string, unknown> = {
    markup_percent: percent,
    currency_pair: "CNY_RUB",
    updated_at: new Date().toISOString(),
  };
  if (deliveryFee != null) patch.delivery_fee = deliveryFee;

  const { error } = await getSupabase()
    .from("pricing_config")
    .upsert(patch, { onConflict: "id" })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
}
