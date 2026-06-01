import { getSupabase } from "../db/client.js";
import { getEnvOptional } from "../types/env.types.js";

let cachedRates: { cny_rub: number; cny_usd: number; at: number } | null = null;
const CACHE_TTL_MS = 3600000;

export async function getCnyRubRate(): Promise<number> {
  if (cachedRates && Date.now() - cachedRates.at < CACHE_TTL_MS) {
    return cachedRates.cny_rub;
  }

  try {
    const res = await fetch("https://www.cbr.ru/scripts/XML_daily.asp", {
      signal: AbortSignal.timeout(10000),
    });
    const xml = await res.text();
    const cnyMatch = xml.match(
      /<CharCode>CNY<\/CharCode>[\s\S]*?<Value>([\d,]+)<\/Value>/,
    );
    if (cnyMatch?.[1]) {
      const rate = Number.parseFloat(cnyMatch[1].replace(",", "."));
      if (!Number.isNaN(rate) && rate > 0) {
        cachedRates = {
          cny_rub: rate,
          cny_usd: Number(getEnvOptional("CNY_TO_USD_RATE", "7.25")),
          at: Date.now(),
        };
        await updatePricingConfigRate(rate);
        return rate;
      }
    }
  } catch {
    // fallback
  }

  const fallback = Number(getEnvOptional("CNY_TO_RUB_RATE", "13.5"));
  cachedRates = {
    cny_rub: fallback,
    cny_usd: Number(getEnvOptional("CNY_TO_USD_RATE", "7.25")),
    at: Date.now(),
  };
  return fallback;
}

async function updatePricingConfigRate(rate: number): Promise<void> {
  const { data } = await getSupabase()
    .from("pricing_config")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (data?.id) {
    await getSupabase()
      .from("pricing_config")
      .update({ rate, updated_at: new Date().toISOString() })
      .eq("id", data.id);
  }
}

export async function refreshRates(): Promise<{ cny_rub: number }> {
  const cny_rub = await getCnyRubRate();
  return { cny_rub };
}
