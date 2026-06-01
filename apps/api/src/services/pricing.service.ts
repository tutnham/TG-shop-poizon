import type { Result } from "@poizon-shop/shared";
import { getSupabase } from "../db/client.js";
import { appError } from "../types/app-error.types.js";
import { getEnvOptional } from "../types/env.types.js";

export interface PricingConfig {
  rate_cny_rub: number;
  rate_cny_usd: number;
  markup_percent: number;
  delivery_fee: number;
}

export async function getPricingConfig(): Promise<PricingConfig> {
  const { data } = await getSupabase()
    .from("pricing_config")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    rate_cny_rub: Number(
      data?.rate ?? getEnvOptional("CNY_TO_RUB_RATE", "13.5"),
    ),
    rate_cny_usd: Number(getEnvOptional("CNY_TO_USD_RATE", "7.25")),
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
  const { data } = await getSupabase()
    .from("pricing_config")
    .select("id")
    .limit(1)
    .maybeSingle();
  const patch: Record<string, unknown> = {
    markup_percent: percent,
    updated_at: new Date().toISOString(),
  };
  if (deliveryFee != null) patch.delivery_fee = deliveryFee;
  if (data?.id) {
    await getSupabase().from("pricing_config").update(patch).eq("id", data.id);
  } else {
    await getSupabase().from("pricing_config").insert(patch);
  }
}
