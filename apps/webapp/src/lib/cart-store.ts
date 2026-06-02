import { apiGet } from "../api/client.js";
import type { CartLineView } from "../components/cart-item-card.js";
import {
  demoCartTotals,
  demoLinesToCartView,
  isDemoLine,
} from "./demo-cart.js";

export type CartSnapshot = {
  lines: CartLineView[];
  total_rub: number;
  total_usdt: number;
  apiFailed: boolean;
  hasApiLines: boolean;
  hasDemoLines: boolean;
};

/** API-корзина + локальная демо-корзина (всегда мержим демо). */
export async function loadCartSnapshot(): Promise<CartSnapshot> {
  const demoLines = demoLinesToCartView();
  const demoTotals = demoCartTotals();

  try {
    const res = await apiGet<{
      data?: CartLineView[];
      total_rub?: number;
      total_usdt?: number;
    }>("/api/cart");

    const apiLines = (Array.isArray(res.data) ? res.data : [])
      .filter(
        (line): line is CartLineView =>
          Boolean(line?.id && line?.product_id && line?.product?.name),
      )
      .map((line) => ({
        ...line,
        size: String(line.size ?? ""),
        quantity: Number(line.quantity) || 1,
      }));
    const lines = [...apiLines, ...demoLines];

    return {
      lines,
      total_rub: (Number(res.total_rub) || 0) + demoTotals.total_rub,
      total_usdt: (Number(res.total_usdt) || 0) + demoTotals.total_usdt,
      apiFailed: false,
      hasApiLines: apiLines.length > 0,
      hasDemoLines: demoLines.length > 0,
    };
  } catch {
    return {
      lines: demoLines,
      total_rub: demoTotals.total_rub,
      total_usdt: demoTotals.total_usdt,
      apiFailed: true,
      hasApiLines: false,
      hasDemoLines: demoLines.length > 0,
    };
  }
}

export function cartHasCheckoutItems(snapshot: CartSnapshot): boolean {
  return snapshot.lines.some((line) => !isDemoLine(line));
}
