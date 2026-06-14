import type { CartLineView } from "../components/cart-item-card.js";
import { loadCartSnapshot } from "./cart-store.js";

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

/** Синхронная проверка корзины (кэш из последнего API-ответа). */
let cachedLines: CartLineView[] = [];

export function setCachedLines(lines: CartLineView[]): void {
  cachedLines = lines;
}

export function isProductInCartSync(productId: string, size?: string): boolean {
  return size
    ? isInCartWithSize(cachedLines, productId, size)
    : isInCartAnySize(cachedLines, productId);
}

/** Сбросить кэш корзины (вызывается при загрузке главной страницы). */
export function clearCartCache(): void {
  cachedLines = [];
}

export async function loadCartLines(): Promise<CartLineView[]> {
  const snap = await loadCartSnapshot();
  setCachedLines(snap.lines);
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
