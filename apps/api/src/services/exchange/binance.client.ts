import { Decimal } from "decimal.js";
import type { ExchangeRate } from "./rate-types.js";
import { ProviderError } from "./rate-types.js";

const BINANCE_BASE = "https://api.binance.com/api/v3/ticker/price";

/** TTL для USDT→RUB рыночного курса: 5 минут */
export const BINANCE_USDT_RUB_TTL_MS = 5 * 60 * 1000;

interface BinanceTicker {
  symbol: string;
  price: string;
}

/** Получить курс USDT→RUB из Binance с полными метаданными */
export async function fetchUsdtRubRateFromBinance(): Promise<ExchangeRate> {
  const url = `${BINANCE_BASE}?symbol=USDTRUB`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new ProviderError(`HTTP ${res.status}`, "binance", res.status);
  }
  const data = (await res.json()) as BinanceTicker;
  const price = Number.parseFloat(data.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ProviderError("Invalid USDTRUB price", "binance");
  }

  const now = new Date();
  return {
    rate: new Decimal(price),
    source: "binance",
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + BINANCE_USDT_RUB_TTL_MS).toISOString(),
    isFallback: false,
    isStale: false,
  };
}

// ── Обратная совместимость: старый API ──────────────────────────────
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

/** Не использовать как первичный курс — только кросс-курс usdtRub / cnyRub */
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
