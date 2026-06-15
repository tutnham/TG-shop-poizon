import { Decimal } from "decimal.js";
import { getSupabase, isSupabaseConfigured } from "../db/client.js";
import { getConfigValue, setConfigValue } from "../db/config.repository.js";
import { getEnvOptional } from "../types/env.types.js";
import {
  BINANCE_USDT_RUB_TTL_MS,
  fetchUsdtRubFromBinance,
  fetchUsdtRubRateFromBinance,
} from "./exchange/binance.client.js";
import {
  type ExchangeRateCacheRepository,
  InMemoryExchangeRateCacheRepository,
} from "./exchange/cache.repository.js";
import {
  CBR_CNY_RUB_TTL_MS,
  fetchCnyRubFromCbr,
  fetchCnyRubRateFromCbr,
} from "./exchange/cbr.client.js";
import type { ExchangeRate, RateSnapshot } from "./exchange/rate-types.js";
import { RateStaleError, RateUnavailableError } from "./exchange/rate-types.js";
import type { ExchangeRates } from "./exchange/types.js";
import { buildExchangeRates } from "./exchange/types.js";
import { getPricingModuleConfig } from "./pricing.config.js";

// ── Глобальный кеш (in-memory) ──────────────────────────────────────
const cache: ExchangeRateCacheRepository =
  new InMemoryExchangeRateCacheRepository();

// ── TTL по умолчанию (переопределяется через конфиг) ────────────────
export const CACHE_TTL_MS = 3600000; // для обратной совместимости

// ── Вспомогательные функции ─────────────────────────────────────────

function markStaleness(rate: ExchangeRate, ttlMs: number): ExchangeRate {
  const age = Date.now() - new Date(rate.fetchedAt).getTime();
  if (age > ttlMs) {
    return { ...rate, isStale: true };
  }
  return rate;
}

function isRateUsable(
  rate: ExchangeRate,
  policy: "STRICT" | "ALLOW_FALLBACK",
): boolean {
  if (policy === "STRICT" && rate.isStale) return false;
  if (policy === "STRICT" && rate.isFallback) return false;
  return true;
}

function envFallbackRates(): ExchangeRates {
  const cny_rub = Number(getEnvOptional("CNY_TO_RUB_RATE", "13.5"));
  const cny_usd_env = Number(getEnvOptional("CNY_TO_USD_RATE", "7.25"));
  const usdt_rub = cny_rub * cny_usd_env;
  return buildExchangeRates(
    cny_rub,
    usdt_rub,
    {
      cny_rub: "env",
      usdt_rub: "env",
    },
    { isFallback: true, isStale: true },
  );
}

// ── ExchangeRateService ─────────────────────────────────────────────

export class ExchangeRateService {
  constructor(
    private readonly cacheRepo: ExchangeRateCacheRepository = cache,
  ) {}

  /** Получить «живой» курс CNY→RUB с fallback-цепочкой */
  async getCnyRubRate(): Promise<ExchangeRate> {
    const config = getPricingModuleConfig();

    const freshCached = this.cacheRepo.getCnyRub();
    if (freshCached) {
      const checked = markStaleness(freshCached, config.cnyRubTtlMs);
      if (!checked.isStale && !checked.isFallback) {
        return checked;
      }
    }

    try {
      const live = await fetchCnyRubRateFromCbr();
      const checked = markStaleness(live, config.cnyRubTtlMs);
      this.cacheRepo.setCnyRub(checked);
      return checked;
    } catch (e) {
      console.warn("[ExchangeRateService] CBR fetch failed:", e);
    }

    // Попытка взять из кеша
    const cached = this.cacheRepo.getCnyRub();
    if (cached) {
      const checked = markStaleness(cached, config.cnyRubTtlMs);
      return { ...checked, isFallback: true };
    }

    // Попытка из БД
    const dbRate = await this._loadCnyRubFromDb();
    if (dbRate) {
      const checked = markStaleness(dbRate, config.cnyRubTtlMs);
      this.cacheRepo.setCnyRub(checked);
      return { ...checked, isFallback: true };
    }

    // Последний рубеж: ENV
    const envRate = this._envCnyRub();
    this.cacheRepo.setCnyRub(envRate);
    return envRate;
  }

  /** Получить «живой» курс USDT→RUB с fallback-цепочкой */
  async getUsdtRubRate(): Promise<ExchangeRate> {
    const config = getPricingModuleConfig();

    const freshCached = this.cacheRepo.getUsdtRub();
    if (freshCached) {
      const checked = markStaleness(freshCached, config.usdtRubTtlMs);
      if (!checked.isStale && !checked.isFallback) {
        return checked;
      }
    }

    try {
      const live = await fetchUsdtRubRateFromBinance();
      const checked = markStaleness(live, config.usdtRubTtlMs);
      this.cacheRepo.setUsdtRub(checked);
      return checked;
    } catch (e) {
      console.warn("[ExchangeRateService] Binance fetch failed:", e);
    }

    // Попытка взять из кеша
    const cached = this.cacheRepo.getUsdtRub();
    if (cached) {
      const checked = markStaleness(cached, config.usdtRubTtlMs);
      return { ...checked, isFallback: true };
    }

    // Попытка из БД
    const dbRate = await this._loadUsdtRubFromDb();
    if (dbRate) {
      const checked = markStaleness(dbRate, config.usdtRubTtlMs);
      this.cacheRepo.setUsdtRub(checked);
      return { ...checked, isFallback: true };
    }

    // Последний рубеж: ENV
    const envRate = this._envUsdtRub();
    this.cacheRepo.setUsdtRub(envRate);
    return envRate;
  }

  /** Получить снимок пары курсов */
  async getRateSnapshot(): Promise<RateSnapshot> {
    const [cnyRub, usdtRub] = await Promise.all([
      this.getCnyRubRate(),
      this.getUsdtRubRate(),
    ]);
    // usdtCny = usdtRub / cnyRub (кросс-курс)
    const usdtCny = usdtRub.rate.div(cnyRub.rate);
    return {
      cnyRub,
      usdtRub,
      usdtCny,
      computedAt: new Date().toISOString(),
    };
  }

  /** Проверить, можно ли рассчитать цену с текущими курсами */
  validateRateForPolicy(
    rate: ExchangeRate,
    policy: "STRICT" | "ALLOW_FALLBACK",
    rateType: "cny_rub" | "usdt_rub",
  ): void {
    if (!isRateUsable(rate, policy)) {
      if (rate.isStale || rate.isFallback) {
        throw new RateStaleError(
          `Rate policy is STRICT but rate is ${rate.isStale ? "stale" : "fallback"}`,
          rateType,
          rate.fetchedAt,
        );
      }
      throw new RateUnavailableError(
        "Rate not available for STRICT policy",
        rateType,
      );
    }
  }

  /** Инвалидировать кеш */
  invalidate(): void {
    this.cacheRepo.invalidate();
  }

  // ── Приватные методы ──────────────────────────────────────────────

  private async _loadCnyRubFromDb(): Promise<ExchangeRate | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data } = await getSupabase()
        .from("pricing_config")
        .select("rate, rates_updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (
        data?.rate != null &&
        Number.isFinite(Number(data.rate)) &&
        Number(data.rate) > 0
      ) {
        const fetchedAt =
          typeof data.rates_updated_at === "string"
            ? data.rates_updated_at
            : new Date().toISOString();
        const config = getPricingModuleConfig();
        return {
          rate: new Decimal(data.rate),
          source: "cache",
          fetchedAt,
          expiresAt: new Date(
            new Date(fetchedAt).getTime() + config.cnyRubTtlMs,
          ).toISOString(),
          isFallback: true,
          isStale: false,
        };
      }
    } catch {
      /* DB недоступна — не фатально */
    }
    return null;
  }

  private async _loadUsdtRubFromDb(): Promise<ExchangeRate | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const usdtFromConfig = await getConfigValue<number | null>(
        "usdt_rub",
        null,
      );
      const updatedAt = await getConfigValue<string | null>(
        "rates_updated_at",
        null,
      );
      if (usdtFromConfig != null && usdtFromConfig > 0) {
        const fetchedAt = updatedAt ?? new Date().toISOString();
        const config = getPricingModuleConfig();
        return {
          rate: new Decimal(usdtFromConfig),
          source: "cache",
          fetchedAt,
          expiresAt: new Date(
            new Date(fetchedAt).getTime() + config.usdtRubTtlMs,
          ).toISOString(),
          isFallback: true,
          isStale: false,
        };
      }
    } catch {
      /* DB недоступна — не фатально */
    }
    return null;
  }

  private _envCnyRub(): ExchangeRate {
    const rate = Number(getEnvOptional("CNY_TO_RUB_RATE", "13.5"));
    const now = new Date();
    return {
      rate: new Decimal(Number.isFinite(rate) && rate > 0 ? rate : 13.5),
      source: "env",
      fetchedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + getPricingModuleConfig().cnyRubTtlMs,
      ).toISOString(),
      isFallback: true,
      isStale: true,
    };
  }

  private _envUsdtRub(): ExchangeRate {
    const cny_rub = Number(getEnvOptional("CNY_TO_RUB_RATE", "13.5"));
    const cny_usd_env = Number(getEnvOptional("CNY_TO_USD_RATE", "7.25"));
    const usdt_rub = cny_rub * cny_usd_env;
    const now = new Date();
    return {
      rate: new Decimal(
        Number.isFinite(usdt_rub) && usdt_rub > 0 ? usdt_rub : 98,
      ),
      source: "env",
      fetchedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + getPricingModuleConfig().usdtRubTtlMs,
      ).toISOString(),
      isFallback: true,
      isStale: true,
    };
  }
}

// ── Singleton ───────────────────────────────────────────────────────
let _service: ExchangeRateService | null = null;

export function getExchangeRateService(): ExchangeRateService {
  if (!_service) _service = new ExchangeRateService();
  return _service;
}

export function resetExchangeRateService(): void {
  _service = null;
  cache.invalidate();
}

/** Seed in-memory rates for tests (avoids slow live fetch fallbacks). */
export function seedExchangeRateCacheForTests(
  cnyRub: number,
  usdtRub: number,
  options?: {
    fetchedAt?: string;
    isStale?: boolean;
    isFallback?: boolean;
  },
): void {
  const fetchedAt = options?.fetchedAt ?? new Date().toISOString();
  const isStale = options?.isStale ?? false;
  const isFallback = options?.isFallback ?? false;
  const fetchedMs = new Date(fetchedAt).getTime();

  cache.setCnyRub({
    rate: new Decimal(cnyRub),
    source: "cbr-mirror",
    fetchedAt,
    expiresAt: new Date(fetchedMs + CBR_CNY_RUB_TTL_MS).toISOString(),
    isFallback,
    isStale,
  });
  cache.setUsdtRub({
    rate: new Decimal(usdtRub),
    source: "binance",
    fetchedAt,
    expiresAt: new Date(fetchedMs + BINANCE_USDT_RUB_TTL_MS).toISOString(),
    isFallback,
    isStale,
  });
}

/** Seed only USDT leg (CNY will be fetched or fall through). */
export function seedUsdtRubCacheForTests(
  usdtRub: number,
  options?: {
    fetchedAt?: string;
    isStale?: boolean;
    isFallback?: boolean;
  },
): void {
  const fetchedAt = options?.fetchedAt ?? new Date().toISOString();
  const fetchedMs = new Date(fetchedAt).getTime();
  cache.setUsdtRub({
    rate: new Decimal(usdtRub),
    source: "binance",
    fetchedAt,
    expiresAt: new Date(fetchedMs + BINANCE_USDT_RUB_TTL_MS).toISOString(),
    isFallback: options?.isFallback ?? false,
    isStale: options?.isStale ?? false,
  });
}

// ── Обратная совместимость: старые функции ──────────────────────────

/** @deprecated Используйте ExchangeRateService.getCnyRubRate() */
export async function fetchLiveRates(): Promise<ExchangeRates> {
  const [cbr, usdt_rub] = await Promise.all([
    fetchCnyRubFromCbr(),
    fetchUsdtRubFromBinance(),
  ]);
  return buildExchangeRates(cbr.rate, usdt_rub, {
    cny_rub: "cbr",
    usdt_rub: "binance",
  });
}

let cachedRates: ExchangeRates | null = null;

function isCacheFresh(rates: ExchangeRates | null): boolean {
  if (!rates) return false;
  const at = new Date(rates.fetched_at).getTime();
  return Date.now() - at < CACHE_TTL_MS;
}

async function loadRatesFromDb(): Promise<ExchangeRates | null> {
  if (!isSupabaseConfigured()) return null;

  const { data } = await getSupabase()
    .from("pricing_config")
    .select("rate, rate_cny_usdt, rates_updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cny_rub = data?.rate != null ? Number(data.rate) : null;
  const rate_cny_usdt =
    data?.rate_cny_usdt != null ? Number(data.rate_cny_usdt) : null;
  const usdt_rub =
    cny_rub != null && rate_cny_usdt != null && rate_cny_usdt > 0
      ? cny_rub * rate_cny_usdt
      : null;
  const fetched_at =
    typeof data?.rates_updated_at === "string"
      ? data.rates_updated_at
      : new Date().toISOString();

  if (cny_rub == null || usdt_rub == null || cny_rub <= 0 || usdt_rub <= 0) {
    const usdtFromConfig = await getConfigValue<number | null>(
      "usdt_rub",
      null,
    );
    if (cny_rub != null && usdtFromConfig != null && usdtFromConfig > 0) {
      return {
        ...buildExchangeRates(
          cny_rub,
          usdtFromConfig,
          {
            cny_rub: "cache",
            usdt_rub: "cache",
          },
          { isFallback: true },
        ),
        fetched_at,
      };
    }
    return null;
  }

  return {
    ...buildExchangeRates(
      cny_rub,
      usdt_rub,
      {
        cny_rub: "cache",
        usdt_rub: "cache",
      },
      { isFallback: true },
    ),
    fetched_at,
  };
}

/** @deprecated Используйте ExchangeRateService */
export async function getCachedRates(): Promise<ExchangeRates | null> {
  if (cachedRates && isCacheFresh(cachedRates)) {
    return cachedRates;
  }
  const db = await loadRatesFromDb();
  if (db && isCacheFresh(db)) {
    cachedRates = db;
  }
  return db;
}

/** @deprecated Используйте ExchangeRateService */
export async function refreshRates(force = false): Promise<ExchangeRates> {
  if (!force && cachedRates && isCacheFresh(cachedRates)) {
    return cachedRates;
  }

  if (!force) {
    const existing = await getCachedRates();
    if (existing && isCacheFresh(existing)) {
      return existing;
    }
  }

  try {
    const rates = await fetchLiveRates();
    await persistRates(rates);
    cachedRates = rates;
    return rates;
  } catch (e) {
    console.warn("[currency] live fetch failed:", e);
    const fromDb = await loadRatesFromDb();
    if (fromDb) {
      cachedRates = fromDb;
      return fromDb;
    }
    const fallback = envFallbackRates();
    cachedRates = fallback;
    return fallback;
  }
}

/** @deprecated Используйте ExchangeRateService */
export async function getExchangeRates(): Promise<ExchangeRates> {
  return refreshRates();
}

/** @deprecated Используйте ExchangeRateService */
export async function getRatesHealth(): Promise<{
  last_rates_at: string | null;
  rates_stale: boolean;
}> {
  const updatedAt = await getConfigValue<string | null>(
    "rates_updated_at",
    null,
  );
  const last_rates_at = updatedAt ?? cachedRates?.fetched_at ?? null;
  if (!last_rates_at) {
    return { last_rates_at: null, rates_stale: true };
  }
  const age = Date.now() - new Date(last_rates_at).getTime();
  return {
    last_rates_at,
    rates_stale: age > CACHE_TTL_MS,
  };
}

/** @deprecated Используйте ExchangeRateService */
export async function persistRates(rates: ExchangeRates): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const now = rates.fetched_at;
  let id: string | null = null;
  try {
    const { data } = await getSupabase()
      .from("pricing_config")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    id = (data?.id as string | undefined) ?? null;
  } catch {
    /* игнорируем */
  }

  const patch = {
    rate: rates.cny_rub,
    rate_cny_usdt: rates.rate_cny_usd,
    rates_updated_at: now,
    updated_at: now,
  };

  if (id) {
    const { error } = await getSupabase()
      .from("pricing_config")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await getSupabase()
      .from("pricing_config")
      .insert({
        ...patch,
        markup_percent: Number(getEnvOptional("MARKUP_PERCENT", "25")),
        delivery_fee: Number(getEnvOptional("DELIVERY_RUB", "500")),
        currency_pair: "CNY_RUB",
      });
    if (error) throw new Error(error.message);
  }

  await setConfigValue("usdt_rub", rates.usdt_rub);
  await setConfigValue("rates_updated_at", now);
  await setConfigValue("rates_source", rates.sources);
}
