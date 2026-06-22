import { Decimal } from "decimal.js";
import { getSupabase } from "../db/client.js";
import { getEnvOptional } from "../types/env.types.js";
import { getExchangeRateService } from "./currency.service.js";
import type {
  CalculationBreakdown,
  PriceCalculationInput,
  PriceCalculationResult,
  RateSnapshot,
  UsdtCalculationBreakdown,
} from "./exchange/rate-types.js";
import { RateStaleError, RateUnavailableError } from "./exchange/rate-types.js";
import { getPricingModuleConfig } from "./pricing.config.js";

/** Настройки магазина для расчёта и отображения цен */
export interface ShopPricingSettings {
  rate_cny_rub: number;
  rate_cny_usd: number;
  markup_percent: number;
  delivery_fee: number;
}

/** Контекст синхронного расчёта цен (один снимок курсов на весь batch) */
export interface SyncPricingContext {
  rateCnyRub: Decimal;
  rateCnyUsd: Decimal;
  markupPercent: Decimal;
  deliveryFee: Decimal;
}

/** @deprecated Используйте ShopPricingSettings */
export type PricingConfig = ShopPricingSettings;

// ── PriceCalculator ─────────────────────────────────────────────────

export class PriceCalculator {
  /**
   * Рассчитать публичную цену товара (RUB) и внутреннюю цену (USDT).
   *
   * Публичная цена: цена из ЦБ РФ (CNY→RUB) + наценка + доставка.
   * Внутренняя цена: через кросс-курс USDT/CNY + наценка + fxBuffer.
   */
  async calculate(
    input: PriceCalculationInput,
  ): Promise<PriceCalculationResult> {
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
        usdtRub: snapshot.usdtRub
          .source as UsdtCalculationBreakdown["sources"]["usdtRub"],
        cnyRub: snapshot.cnyRub
          .source as UsdtCalculationBreakdown["sources"]["cnyRub"],
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

    rateService.validateRateForPolicy(
      cnyRub,
      config.publicRatePolicy,
      "cny_rub",
    );

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
        usdtRub: snapshot.usdtRub
          .source as UsdtCalculationBreakdown["sources"]["usdtRub"],
        cnyRub: snapshot.cnyRub
          .source as UsdtCalculationBreakdown["sources"]["cnyRub"],
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
      mode === "ROUND_HALF_UP" ? Decimal.ROUND_HALF_UP : Decimal.ROUND_CEIL;
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

// ── Синхронный расчёт цен для синка (Decimal, legacy-округление) ───

function roundRubLegacy(value: Decimal): number {
  return Math.ceil(value.div(10).toNumber()) * 10;
}

function roundUsdtLegacy(value: Decimal): number {
  return Math.ceil(value.mul(10).toNumber()) / 10;
}

/** Синхронный расчёт RUB/USDT из CNY с сохранением legacy-округления */
export function calculateProductPrices(
  priceCny: number | Decimal,
  ctx: SyncPricingContext,
): { rub: number; usdt: number } {
  const cny = priceCny instanceof Decimal ? priceCny : new Decimal(priceCny);
  if (cny.lt(0)) throw new Error("Invalid price");

  const markupFactor = ctx.markupPercent.div(100).plus(1);
  const rubBase = cny.mul(ctx.rateCnyRub);
  const rubWithMarkup = rubBase.mul(markupFactor).plus(ctx.deliveryFee);
  const usdtBase = cny.div(ctx.rateCnyUsd);
  const usdtWithMarkup = usdtBase.mul(markupFactor);

  return {
    rub: roundRubLegacy(rubWithMarkup),
    usdt: roundUsdtLegacy(usdtWithMarkup),
  };
}

export function calculateProductPricesFromFen(
  priceFen: number,
  ctx: SyncPricingContext,
): { rub: number; usdt: number; cny: number } {
  const cny = priceFen / 100;
  const prices = calculateProductPrices(cny, ctx);
  return { ...prices, cny };
}

/** Расчёт из готового снимка курсов + настроек магазина (без await на каждый SKU) */
export function buildSyncPricingContextFromSnapshot(
  snapshot: RateSnapshot,
  settings: ShopPricingSettings,
): SyncPricingContext {
  return {
    rateCnyRub: snapshot.cnyRub.rate,
    rateCnyUsd: new Decimal(settings.rate_cny_usd),
    markupPercent: new Decimal(settings.markup_percent),
    deliveryFee: new Decimal(settings.delivery_fee),
  };
}

async function loadShopPricingSettingsFromDb(): Promise<{
  markup_percent: number;
  delivery_fee: number;
  rate_cny_usd: number;
}> {
  const { data } = await getSupabase()
    .from("pricing_config")
    .select("markup_percent, delivery_fee, rate_cny_usdt")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const markup = Number(
    data?.markup_percent ?? getEnvOptional("MARKUP_PERCENT", "25"),
  );
  const delivery = Number(
    data?.delivery_fee ?? getEnvOptional("DELIVERY_RUB", "0"),
  );
  const rateCnyUsd = Number(
    data?.rate_cny_usdt ?? getEnvOptional("CNY_TO_USD_RATE", "7.25"),
  );

  return {
    markup_percent: Number.isFinite(markup) ? markup : 25,
    delivery_fee: Number.isFinite(delivery) ? delivery : 0,
    rate_cny_usd:
      Number.isFinite(rateCnyUsd) && rateCnyUsd > 0 ? rateCnyUsd : 7.25,
  };
}

/** Загрузить настройки магазина с актуальным курсом CNY→RUB */
export async function loadShopPricingSettings(): Promise<ShopPricingSettings> {
  const [snapshot, dbSettings] = await Promise.all([
    getExchangeRateService().getRateSnapshot(),
    loadShopPricingSettingsFromDb(),
  ]);

  const rateCnyRub = snapshot.cnyRub.rate.toNumber();
  return {
    rate_cny_rub:
      Number.isFinite(rateCnyRub) && rateCnyRub > 0 ? rateCnyRub : 13.5,
    rate_cny_usd: dbSettings.rate_cny_usd,
    markup_percent: dbSettings.markup_percent,
    delivery_fee: dbSettings.delivery_fee,
  };
}

/** Один снимок курсов + настройки для пакетного синка */
export async function buildSyncPricingContext(): Promise<SyncPricingContext> {
  const [snapshot, settings] = await Promise.all([
    getExchangeRateService().getRateSnapshot(),
    loadShopPricingSettings(),
  ]);
  return buildSyncPricingContextFromSnapshot(snapshot, settings);
}

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
