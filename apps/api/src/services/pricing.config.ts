import { getEnvOptional } from "../types/env.types.js";

// ── Конфигурация модуля расчёта цен ─────────────────────────────────
export interface PricingModuleConfig {
  /** Политика расчёта публичной цены */
  publicRatePolicy: "STRICT" | "ALLOW_FALLBACK";
  /** Политика расчёта внутренней (USDT) цены */
  internalRatePolicy: "STRICT" | "ALLOW_FALLBACK";
  /** Режим округления */
  roundingMode: "ROUND_HALF_UP" | "ROUND_CEIL";
  /** Количество знаков после запятой для итогового округления */
  roundingScale: number;
  /** TTL для CNY→RUB от ЦБ РФ (мс), по умолчанию 24 часа */
  cnyRubTtlMs: number;
  /** TTL для USDT→RUB рыночного курса (мс), по умолчанию 5 минут */
  usdtRubTtlMs: number;
  /** Буфер волатильности для внутреннего USDT-расчёта (доля, 0.03 = 3%) */
  fxBufferPct: number;
}

function envNumber(key: string, fallback: number): number {
  const raw = getEnvOptional(key);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Значения по умолчанию */
const DEFAULTS: PricingModuleConfig = {
  publicRatePolicy: "ALLOW_FALLBACK",
  internalRatePolicy: "ALLOW_FALLBACK",
  roundingMode: "ROUND_CEIL",
  roundingScale: 0,
  cnyRubTtlMs: 24 * 60 * 60 * 1000,
  usdtRubTtlMs: 5 * 60 * 1000,
  fxBufferPct: 0.03,
};

let _config: PricingModuleConfig | null = null;

export function getPricingModuleConfig(): PricingModuleConfig {
  if (_config) return _config;

  _config = {
    publicRatePolicy:
      (getEnvOptional(
        "PRICING_PUBLIC_RATE_POLICY",
        DEFAULTS.publicRatePolicy,
      ) as PricingModuleConfig["publicRatePolicy"]) ??
      DEFAULTS.publicRatePolicy,
    internalRatePolicy:
      (getEnvOptional(
        "PRICING_INTERNAL_RATE_POLICY",
        DEFAULTS.internalRatePolicy,
      ) as PricingModuleConfig["internalRatePolicy"]) ??
      DEFAULTS.internalRatePolicy,
    roundingMode:
      (getEnvOptional(
        "PRICING_ROUNDING_MODE",
        DEFAULTS.roundingMode,
      ) as PricingModuleConfig["roundingMode"]) ?? DEFAULTS.roundingMode,
    roundingScale: envNumber("PRICING_ROUNDING_SCALE", DEFAULTS.roundingScale),
    cnyRubTtlMs: envNumber("PRICING_CNY_RUB_TTL_MS", DEFAULTS.cnyRubTtlMs),
    usdtRubTtlMs: envNumber("PRICING_USDT_RUB_TTL_MS", DEFAULTS.usdtRubTtlMs),
    fxBufferPct: envNumber("PRICING_FX_BUFFER_PCT", DEFAULTS.fxBufferPct),
  };

  return _config;
}

/** Сбросить кеш конфига (для тестов) */
export function resetPricingModuleConfig(): void {
  _config = null;
}
