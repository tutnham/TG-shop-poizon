const CBR_JSON_URL = "https://www.cbr-xml-daily.ru/daily_json.js";

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
