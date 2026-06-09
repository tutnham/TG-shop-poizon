import type { ProductDetail } from "@poizon-shop/shared";
import { apiGet, apiPost } from "../api/client.js";
import { mountCartPeek } from "../components/cart-peek.js";
import { t } from "../i18n/index.js";
import { getCurrentPath } from "../router.js";
import { refreshCartBadge } from "./cart-badge.js";
import { notifyCartChanged } from "./cart-presence.js";
import { showToast } from "./toast.js";

export function firstAvailableSize(product: ProductDetail): string | null {
  const sizes = Object.values(product.sizes ?? {}).flat();
  const stock = product.stock ?? {};

  if (sizes.length === 0) {
    return product.is_available ? "OS" : null;
  }

  for (const size of sizes) {
    if (stock[size] !== false) return size;
  }
  return null;
}

export async function addProductToCart(
  productId: string,
  quantity = 1,
  explicitSize?: string,
): Promise<void> {
  let size = explicitSize;

  if (!size) {
    const { data: product } = await apiGet<{ data: ProductDetail }>(
      `/api/products/${productId}`,
    );

    if (!product.is_available) {
      throw new Error(t("out_of_stock"));
    }

    size = firstAvailableSize(product) ?? undefined;
  }

  if (!size) {
    throw new Error(t("out_of_stock"));
  }

  await apiPost("/api/cart", {
    product_id: productId,
    size,
    quantity,
  });

  refreshCartBadge();
  refreshHomeCartPeek();
  notifyCartChanged();
}

function refreshHomeCartPeek(): void {
  if (getCurrentPath() !== "/") return;
  const main = document.querySelector(".home-main");
  if (main instanceof HTMLElement) void mountCartPeek(main);
}

export async function addProductToCartWithFeedback(
  productId: string,
): Promise<void> {
  await addProductToCart(productId, 1);
  showToast(t("added_to_cart"));
}
