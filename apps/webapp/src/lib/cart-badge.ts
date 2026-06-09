import { apiGet } from "../api/client.js";

/** Обновить точку на иконке корзины в нижнем меню. */
export function refreshCartBadge(): void {
  void apiGet<{ data?: { quantity?: number }[] }>("/api/cart")
    .then((res) => {
      const dot = document.getElementById("cart-nav-dot");
      if (!dot) return;
      const qty = (res.data ?? []).reduce(
        (s, l) => s + (Number(l.quantity) || 1),
        0,
      );
      dot.hidden = qty === 0;
    })
    .catch(() => {
      const dot = document.getElementById("cart-nav-dot");
      if (dot) dot.hidden = true;
    });
}
