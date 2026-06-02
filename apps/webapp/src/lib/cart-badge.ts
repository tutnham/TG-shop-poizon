import { apiGet } from "../api/client.js";
import { demoCartCount } from "./demo-cart.js";

/** Обновить точку на иконке корзины в нижнем меню. */
export function refreshCartBadge(): void {
  const demoQty = demoCartCount();

  void apiGet<{ data?: { quantity?: number }[] }>("/api/cart")
    .then((res) => {
      const dot = document.getElementById("cart-nav-dot");
      if (!dot) return;
      const apiQty = (res.data ?? []).reduce(
        (s, l) => s + (Number(l.quantity) || 1),
        0,
      );
      dot.hidden = apiQty + demoQty === 0;
    })
    .catch(() => {
      const dot = document.getElementById("cart-nav-dot");
      if (dot) dot.hidden = demoQty === 0;
    });
}
