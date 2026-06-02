import type { CartLineView } from "../components/cart-item-card.js";
import { demoLinesToCartView } from "./demo-cart.js";
import { loadCartSnapshot } from "./cart-store.js";

export function isInCart(
  lines: CartLineView[],
  productId: string,
  size?: string,
): boolean {
  return lines.some(
    (l) => l.product_id === productId && (!size || l.size === size),
  );
}

export function isProductInCartSync(
  productId: string,
  size?: string,
): boolean {
  return isInCart(demoLinesToCartView(), productId, size);
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
  return isInCart(lines, productId, size);
}
