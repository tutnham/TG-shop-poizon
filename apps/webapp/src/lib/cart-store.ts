import { apiGet } from "../api/client.js";
import type { CartLineView } from "../components/cart-item-card.js";
import {
  demoCartTotals,
  demoLinesToCartView,
  getDemoCartLines,
} from "./demo-cart.js";

export type CartSnapshot = {
  lines: CartLineView[];
  total_rub: number;
  total_usdt: number;
  apiFailed: boolean;
};

/** API-корзина + локальная демо-корзина. */
export async function loadCartSnapshot(): Promise<CartSnapshot> {
  const demoLines = demoLinesToCartView();
  const demoTotals = demoCartTotals();

  try {
    const res = await apiGet<{
      data: CartLineView[];
      total_rub: number;
      total_usdt: number;
    }>("/api/cart");

    const lines = [...res.data, ...demoLines];
    return {
      lines,
      total_rub: res.total_rub + demoTotals.total_rub,
      total_usdt: res.total_usdt + demoTotals.total_usdt,
      apiFailed: false,
    };
  } catch {
    return {
      lines: demoLines,
      total_rub: demoTotals.total_rub,
      total_usdt: demoTotals.total_usdt,
      apiFailed: demoLines.length === 0,
    };
  }
}

export function hasAnyCartItems(): boolean {
  return getDemoCartLines().length > 0;
}
