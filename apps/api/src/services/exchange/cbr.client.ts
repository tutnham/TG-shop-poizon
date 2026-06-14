import { Decimal } from "decimal.js";
import type { ExchangeRate } from "./rate-types.js";
import { ProviderError } from "./rate-types.js";

// ⚠️ Зеркало ЦБ РФ: НЕ является первичным официальным источником.
// Официальный источник: http://www.cbr.ru/scripts/XML_daily.asp
// Данный URL — JSON-адаптер поверх XML-сервиса ЦБ РФ.
const CBR_JSON_URL = "https://www.cbr-xml-daily.ru/daily_json.js";

/** TTL для CNY→RUB от ЦБ РФ: 24 часа */
export const CBR_CNY_RUB_TTL_MS = 24 * 60 * 60 * 1000;

interface CbrCurrencyRow {
  Value: number | string;
  Nominal: number;
}

interface CbrDailyJson {
  Date?: string;
  CNY?: CbrCurrencyRow;
  Valute?: Record<string, CbrCurrencyRow>;
}

function parseCbrValue(value: number | string): number {
  if (typeof value === "number") return value;
  const n = Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(n)) throw new Error("Invalid CBR Value field");
  return n;
}

function extractCnyRow(data: CbrDailyJson): CbrCurrencyRow | undefined {
  if (data.CNY?.Value != null) return data.CNY;
  return data.Valute?.CNY;
}

/** Получить курс CNY→RUB из зеркала ЦБ РФ с полными метаданными */
export async function fetchCnyRubRateFromCbr(): Promise<ExchangeRate> {
  const res = await fetch(CBR_JSON_URL, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new ProviderError(`HTTP ${res.status}`, "cbr-mirror", res.status);
  }
  const data = (await res.json()) as CbrDailyJson;
  const cny = extractCnyRow(data);
  if (cny?.Value == null || !cny.Nominal) {
    throw new ProviderError("CNY rate not found", "cbr-mirror");
  }
  const numericRate = parseCbrValue(cny.Value) / cny.Nominal;
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    throw new ProviderError("Invalid CNY rate value", "cbr-mirror");
  }

  const now = new Date();
  return {
    rate: new Decimal(numericRate),
    source: "cbr-mirror",
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CBR_CNY_RUB_TTL_MS).toISOString(),
    isFallback: false,
    isStale: false,
  };
}

// ── Обратная совместимость: старый API ──────────────────────────────
export async function fetchCnyRubFromCbr(): Promise<{
  rate: number;
  date?: string;
}> {
  const res = await fetch(CBR_JSON_URL, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`CBR API error: ${res.status}`);
  }
  const data = (await res.json()) as CbrDailyJson;
  const cny = extractCnyRow(data);
  if (cny?.Value == null || !cny.Nominal) {
    throw new Error("CNY rate not found in CBR response");
  }
  const rate = parseCbrValue(cny.Value) / cny.Nominal;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Invalid CNY rate from CBR");
  }
  return { rate, date: data.Date };
}
