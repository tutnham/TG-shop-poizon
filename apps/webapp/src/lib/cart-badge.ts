import { apiGet } from "../api/client.js";

/** Обновить точку на иконке корзины в нижнем меню. */
export function refreshCartBadge(): void {
  void apiGet<{ data: unknown[] }>("/api/cart")
    .then((res) => {
      const dot = document.getElementById("cart-nav-dot");
      if (dot) dot.hidden = !res.data?.length;
    })
    .catch(() => {
      /* offline */
    });
}
