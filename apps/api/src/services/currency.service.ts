import { getSupabase, isSupabaseConfigured } from "../db/client.js";
import { getConfigValue, setConfigValue } from "../db/config.repository.js";
import { getEnvOptional } from "../types/env.types.js";
import { fetchUsdtRubFromBinance } from "./exchange/binance.client.js";
import { fetchCnyRubFromCbr } from "./exchange/cbr.client.js";
import { type ExchangeRates, buildExchangeRates } from "./exchange/types.js";

export const CACHE_TTL_MS = 3600000;

let cachedRates: ExchangeRates | null = null;

function envFallbackRates(): ExchangeRates {
  const cny_rub = Number(getEnvOptional("CNY_TO_RUB_RATE", "13.5"));
  const cny_usd_env = Number(getEnvOptional("CNY_TO_USD_RATE", "7.25"));
  const usdt_rub = cny_rub * cny_usd_env;
  return buildExchangeRates(cny_rub, usdt_rub, {
    cny_rub: "env",
    usdt_rub: "env",
  });
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
        ...buildExchangeRates(cny_rub, usdtFromConfig, {
          cny_rub: "cache",
          usdt_rub: "cache",
        }),
        fetched_at,
      };
    }
    return null;
  }

  return {
    ...buildExchangeRates(cny_rub, usdt_rub, {
      cny_rub: "cache",
      usdt_rub: "cache",
    }),
    fetched_at,
  };
}

async function getLatestPricingConfigId(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("pricing_config")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

export async function persistRates(rates: ExchangeRates): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const now = rates.fetched_at;
  const id = await getLatestPricingConfigId();

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

function isCacheFresh(rates: ExchangeRates | null): boolean {
  if (!rates) return false;
  const at = new Date(rates.fetched_at).getTime();
  return Date.now() - at < CACHE_TTL_MS;
}

/**
 * Read rates from the DB. Uses pricing_config.rates_updated_at as the
 * authoritative fetched_at (kept in sync by persistRates) — no need to
 * re-read shop_config.rates_updated_at.
 */
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

export async function getExchangeRates(): Promise<ExchangeRates> {
  return refreshRates();
}

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
