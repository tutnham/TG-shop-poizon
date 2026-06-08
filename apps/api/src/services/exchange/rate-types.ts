import type { Decimal } from "decimal.js";

// ── Источники курсов ────────────────────────────────────────────────
export type RateSourceCnyRub = "cbr-primary" | "cbr-mirror" | "cache" | "env";
export type RateSourceUsdtRub = "binance" | "cache" | "env";

// ── Метаданные одного курса ─────────────────────────────────────────
export interface ExchangeRate {
  /** Курс (CNY→RUB или USDT→RUB) */
  rate: Decimal;
  /** Источник данных */
  source: RateSourceCnyRub | RateSourceUsdtRub;
  /** ISO-дата получения курса от источника */
  fetchedAt: string;
  /** Момент, после которого курс считается устаревшим */
  expiresAt: string;
  /** true — курс взят из кеша, а не из живого API */
  isFallback: boolean;
  /** true — курс устарел (сейчас > expiresAt) */
  isStale: boolean;
}

// ── Снимок пары курсов ──────────────────────────────────────────────
export interface RateSnapshot {
  cnyRub: ExchangeRate;
  usdtRub: ExchangeRate;
  /** Кросс-курс USDT→CNY = usdtRub / cnyRub */
  usdtCny: Decimal;
  /** ISO-дата формирования снимка */
  computedAt: string;
}

// ── Входные данные для расчёта цены ─────────────────────────────────
export interface PriceCalculationInput {
  /** Цена товара в CNY (юанях, не фэнях) */
  priceCny: Decimal;
  /** Наценка в долях единицы (0.25 = 25%) */
  markupPct: Decimal;
  /** Стоимость доставки в RUB */
  deliveryRub: Decimal;
  /** Буфер волатильности для внутреннего USDT-расчёта (0.03 = 3%) */
  fxBufferPct: Decimal;
}

// ── Детализация расчёта ─────────────────────────────────────────────
export interface CalculationBreakdown {
  /** Исходная цена в CNY */
  priceCny: Decimal;
  /** Использованный курс CNY→RUB */
  cnyRubRate: Decimal;
  /** Источник курса CNY→RUB */
  cnyRubSource: RateSourceCnyRub | RateSourceUsdtRub;
  /** Базовая цена в RUB = priceCny × cnyRubRate */
  baseRub: Decimal;
  /** Наценка в долях единицы */
  markupPct: Decimal;
  /** Наценка в RUB = baseRub × markupPct */
  markupRub: Decimal;
  /** Доставка в RUB */
  deliveryRub: Decimal;
  /** Итог до округления = baseRub + markupRub + deliveryRub */
  subtotalRub: Decimal;
  /** Итог после округления */
  finalRub: Decimal;
  /** Режим округления */
  roundingMode: "ROUND_HALF_UP" | "ROUND_CEIL";
  /** Количество знаков после запятой для округления */
  roundingScale: number;
  /** Timestamp курса CNY→RUB */
  rateTimestamp: string;
  /** true — использован fallback-курс */
  isFallback: boolean;
  /** true — курс устарел */
  isStale: boolean;
}

// ── Результат расчёта цены ──────────────────────────────────────────
export interface PriceCalculationResult {
  /** Публичная цена для пользователя в RUB */
  publicPriceRub: Decimal;
  /** Внутренняя цена в USDT (для закупки) */
  internalPriceUsdt: Decimal;
  /** Детализация публичного расчёта */
  publicBreakdown: CalculationBreakdown;
  /** Детализация внутреннего USDT-расчёта */
  internalBreakdown: UsdtCalculationBreakdown;
}

// ── Детализация USDT-расчёта ────────────────────────────────────────
export interface UsdtCalculationBreakdown {
  /** Курс USDT→RUB */
  usdtRubRate: Decimal;
  /** Курс CNY→RUB (использован для кросс-курса) */
  cnyRubRate: Decimal;
  /** Кросс-курс USDT→CNY = usdtRub / cnyRub */
  usdtCnyRate: Decimal;
  /** Исходная цена в CNY */
  priceCny: Decimal;
  /** Цена в USDT = priceCny / usdtCny */
  baseUsdt: Decimal;
  /** Наценка в USDT = baseUsdt × markupPct */
  markupUsdt: Decimal;
  /** Буфер волатильности в USDT = baseUsdt × fxBufferPct */
  fxBufferUsdt: Decimal;
  /** Итоговая внутренняя цена USDT = baseUsdt + markupUsdt + fxBufferUsdt */
  finalUsdt: Decimal;
  /** Timestamp курса USDT→RUB */
  usdtRubTimestamp: string;
  /** Timestamp курса CNY→RUB */
  cnyRubTimestamp: string;
  /** true — хотя бы один из курсов устарел */
  isStale: boolean;
  /** Источники курсов */
  sources: {
    usdtRub: RateSourceUsdtRub;
    cnyRub: RateSourceCnyRub;
  };
}

// ── Ошибки ──────────────────────────────────────────────────────────
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

export class RateUnavailableError extends Error {
  constructor(
    message: string,
    public readonly rateType: "cny_rub" | "usdt_rub",
  ) {
    super(`Rate unavailable (${rateType}): ${message}`);
    this.name = "RateUnavailableError";
  }
}

export class RateStaleError extends Error {
  constructor(
    message: string,
    public readonly rateType: "cny_rub" | "usdt_rub",
    public readonly fetchedAt: string,
  ) {
    super(`Rate stale (${rateType}, fetched ${fetchedAt}): ${message}`);
    this.name = "RateStaleError";
  }
}
