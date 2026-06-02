import { apiGet } from "../api/client.js";
import { t } from "../i18n/index.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { navigate } from "../router.js";

/** Полоска «в корзине N товаров» на главной — как в демо-магазине. */
export async function mountCartPeek(host: HTMLElement): Promise<void> {
  host.querySelector(".cart-peek")?.remove();

  try {
    const res = await apiGet<{
      data: unknown[];
      total_rub: number;
      total_usdt: number;
    }>("/api/cart");

    if (!res.data.length) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cart-peek";
    btn.innerHTML = `
      <span class="cart-peek__label">
        <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;margin-right:6px">shopping_cart</span>
        ${res.data.length} ${t("cart_items")} · ${t("cart_open")}
      </span>
      <span class="cart-peek__prices">
        <span class="price-rub">${formatRub(res.total_rub)}</span>
        <span class="price-usdt">${formatUsdt(res.total_usdt)}</span>
      </span>
    `;
    btn.addEventListener("click", () => navigate("/cart"));
    host.appendChild(btn);
  } catch {
    /* offline */
  }
}
