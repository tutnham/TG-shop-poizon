import { apiGet } from "../api/client.js";
import type { CartLineView } from "../components/cart-item-card.js";

export type CartSnapshot = {
  lines: CartLineView[];
  total_rub: number;
  total_usdt: number;
  apiFailed: boolean;
};

/** Загрузить корзину из API. */
export async function loadCartSnapshot(): Promise<CartSnapshot> {
  try {
    const res = await apiGet<{
      data?: CartLineView[];
      total_rub?: number;
      total_usdt?: number;
    }>("/api/cart");

    const apiLines = (Array.isArray(res.data) ? res.data : [])
      .filter((line): line is CartLineView =>
        Boolean(line?.id && line?.product_id && line?.product?.name),
      )
      .map((line) => ({
        ...line,
        size: String(line.size ?? ""),
        quantity: Number(line.quantity) || 1,
      }));

    return {
      lines: apiLines,
      total_rub: Number(res.total_rub) || 0,
      total_usdt: Number(res.total_usdt) || 0,
      apiFailed: false,
    };
  } catch {
    return {
      lines: [],
      total_rub: 0,
      total_usdt: 0,
      apiFailed: true,
    };
  }
}
