const BINANCE_BASE = "https://api.binance.com/api/v3/ticker/price";

interface BinanceTicker {
  symbol: string;
  price: string;
}

export async function fetchUsdtRubFromBinance(): Promise<number> {
  const url = `${BINANCE_BASE}?symbol=USDTRUB`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status}`);
  }
  const data = (await res.json()) as BinanceTicker;
  const price = Number.parseFloat(data.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid USDTRUB price from Binance");
  }
  return price;
}

/** Optional: direct USDTCNY for health/logging only */
export async function fetchUsdtCnyFromBinance(): Promise<number | null> {
  try {
    const url = `${BINANCE_BASE}?symbol=USDTCNY`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as BinanceTicker;
    const price = Number.parseFloat(data.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}
