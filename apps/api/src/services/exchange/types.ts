export interface ExchangeRates {
  cny_rub: number;
  usdt_rub: number;
  /** CNY equivalent per 1 USDT (cny_rub / usdt_rub) */
  cny_per_usdt: number;
  /** For PricingService: CNY per 1 USDT = usdt_rub / cny_rub */
  rate_cny_usd: number;
  fetched_at: string;
  sources: {
    cny_rub: "cbr" | "cache" | "env";
    usdt_rub: "binance" | "cache" | "env";
  };
}

export function buildExchangeRates(
  cny_rub: number,
  usdt_rub: number,
  sources: ExchangeRates["sources"],
): ExchangeRates {
  if (cny_rub <= 0 || usdt_rub <= 0) {
    throw new Error("Invalid exchange rates");
  }
  const cny_per_usdt = cny_rub / usdt_rub;
  const rate_cny_usd = usdt_rub / cny_rub;
  return {
    cny_rub,
    usdt_rub,
    cny_per_usdt,
    rate_cny_usd,
    fetched_at: new Date().toISOString(),
    sources,
  };
}
