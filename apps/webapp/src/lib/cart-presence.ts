import type { CartLineView } from "../components/cart-item-card.js";
import { loadCartSnapshot } from "./cart-store.js";
import { demoLinesToCartView } from "./demo-cart.js";

export function isInCartWithSize(
  lines: CartLineView[],
  productId: string,
  size: string,
): boolean {
  if (!size) return false;
  return lines.some(
    (l) => l.product_id === productId && String(l.size) === String(size),
  );
}

export function isInCartAnySize(
  lines: CartLineView[],
  productId: string,
): boolean {
  return lines.some((l) => l.product_id === productId);
}

export function getDemoCartLinesSync(): CartLineView[] {
  return demoLinesToCartView();
}

/** Синхронная проверка только локальной демо-корзины (витрина для заказчика). */
export function isProductInCartSync(productId: string, size?: string): boolean {
  const lines = getDemoCartLinesSync();
  return size
    ? isInCartWithSize(lines, productId, size)
    : isInCartAnySize(lines, productId);
}

export async function loadCartLines(): Promise<CartLineView[]> {
  const snap = await loadCartSnapshot();
  return snap.lines;
}

export async function isProductInCart(
  productId: string,
  size?: string,
): Promise<boolean> {
  const lines = await loadCartLines();
  return size
    ? isInCartWithSize(lines, productId, size)
    : isInCartAnySize(lines, productId);
}

/** Сигнал для обновления карточек после изменения корзины. */
export function notifyCartChanged(): void {
  window.dispatchEvent(new CustomEvent("poizon-cart-changed"));
}
