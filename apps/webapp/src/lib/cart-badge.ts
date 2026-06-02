import { apiGet } from "../api/client.js";
import { getDemoCartLines } from "./demo-cart.js";

/** Обновить точку на иконке корзины в нижнем меню. */
export function refreshCartBadge(): void {
  const demoLines = getDemoCartLines().length;

  void apiGet<{ data: unknown[] }>("/api/cart")
    .then((res) => {
      const dot = document.getElementById("cart-nav-dot");
      if (dot) {
        const apiCount = res.data?.length ?? 0;
        dot.hidden = apiCount + demoLines === 0;
      }
    })
    .catch(() => {
      const dot = document.getElementById("cart-nav-dot");
      if (dot) dot.hidden = demoLines === 0;
    });
}
