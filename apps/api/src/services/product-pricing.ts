import type { PricingConfig } from "./pricing.service.js";
import {
  calculatePrices,
  calculatePricesFromFen,
} from "./pricing.service.js";

export type SizePrice = {
  cny: number;
  rub: number;
  usdt: number;
};

export type SizePricesMap = Record<string, SizePrice>;

export function buildSizePricesFromFen(
  sizePricesFen: Record<string, number>,
  config: PricingConfig,
): SizePricesMap {
  const result: SizePricesMap = {};
  for (const [size, fen] of Object.entries(sizePricesFen)) {
    if (fen <= 0) continue;
    const prices = calculatePricesFromFen(fen, config);
    result[size] = {
      cny: prices.cny,
      rub: prices.rub,
      usdt: prices.usdt,
    };
  }
  return result;
}

export function buildSizePricesFromCny(
  sizePricesCny: Record<string, number>,
  config: PricingConfig,
): SizePricesMap {
  const result: SizePricesMap = {};
  for (const [size, cny] of Object.entries(sizePricesCny)) {
    if (cny <= 0) continue;
    const prices = calculatePrices(cny, config);
    result[size] = {
      cny: Math.round(cny * 100) / 100,
      rub: prices.rub,
      usdt: prices.usdt,
    };
  }
  return result;
}

export function minSizePrice(
  sizePrices: SizePricesMap,
): SizePrice | null {
  const values = Object.values(sizePrices);
  if (!values.length) return null;
  return values.reduce((min, p) => (p.rub < min.rub ? p : min));
}

export function resolveProductSizePrice(
  product: {
    size_prices?: SizePricesMap | null;
    price_rub: number;
    price_usdt: number;
    price_cny?: number | null;
  },
  size: string,
): SizePrice {
  const fromMap = product.size_prices?.[size];
  if (fromMap) return fromMap;
  return {
    rub: Number(product.price_rub),
    usdt: Number(product.price_usdt),
    cny: product.price_cny != null ? Number(product.price_cny) : 0,
  };
}
