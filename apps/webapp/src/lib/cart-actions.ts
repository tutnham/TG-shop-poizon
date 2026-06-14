import type { ProductDetail } from "@poizon-shop/shared";
import { apiGet, apiPost } from "../api/client.js";
import { mountCartPeek } from "../components/cart-peek.js";
import { t } from "../i18n/index.js";
import { getCurrentPath } from "../router.js";
import { refreshCartBadge } from "./cart-badge.js";
import { notifyCartChanged } from "./cart-presence.js";
import { showToast } from "./toast.js";

export function firstAvailableSize(product: ProductDetail): string | null {
  const rawSizes = Object.values(product.sizes ?? {}).flat();
  const DEFAULT_EU_SIZES = ["39", "40", "41", "42", "43", "44", "45", "46"];
  const sizes = rawSizes.length > 0 ? rawSizes : DEFAULT_EU_SIZES;
  const stock =
    rawSizes.length > 0
      ? (product.stock ?? {})
      : Object.fromEntries(DEFAULT_EU_SIZES.map((s) => [s, true]));

  if (!product.is_available) return null;

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
