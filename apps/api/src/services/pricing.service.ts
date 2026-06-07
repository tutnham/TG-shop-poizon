import type { Result } from "@poizon-shop/shared";
import { getSupabase } from "../db/client.js";
import { appError } from "../types/app-error.types.js";
import { getEnvOptional } from "../types/env.types.js";
import { CACHE_TTL_MS, refreshRates } from "./currency.service.js";

export interface PricingConfig {
  rate_cny_rub: number;
  rate_cny_usd: number;
  markup_percent: number;
  delivery_fee: number;
}

function isRatesStale(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > CACHE_TTL_MS;
}

export async function getPricingConfig(options?: {
  skipRatesRefresh?: boolean;
}): Promise<PricingConfig> {
  // Single round-trip: read once, decide if we need to refresh, then re-read.
  let { data } = await getSupabase()
    .from("pricing_config")
    .select(
      "rate, rate_cny_usdt, markup_percent, delivery_fee, rates_updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!options?.skipRatesRefresh && isRatesStale(data?.rates_updated_at)) {
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

export function calculatePricesFromFen(
  priceFen: number,
  config: PricingConfig,
): { rub: number; usdt: number; cny: number } {
  const cny = priceFen / 100;
  const prices = calculatePrices(cny, config);
  return { ...prices, cny };
}

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

export async function setMarkup(
  percent: number,
  deliveryFee?: number,
): Promise<void> {
  if (!Number.isFinite(percent) || percent < 0 || percent > 1000) {
    throw new Error("Invalid markup percent");
  }
  // Preserve required defaults when inserting a fresh row.
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
