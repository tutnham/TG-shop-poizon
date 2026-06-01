import type { ProductListItem } from "@poizon-shop/shared";
import { t } from "../i18n/index.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { navigate } from "../router.js";

export type ProductCardBadge = {
  text: string;
  variant?: "top" | "new";
};

export function renderProductCard(
  p: ProductListItem,
  opts?: { badge?: ProductCardBadge },
): HTMLElement {
  const el = document.createElement("article");
  el.className = "product-card";

  const badgeHtml = opts?.badge
    ? `<div class="product-card__badge${opts.badge.variant === "new" ? " product-card__badge--new" : ""}">${escapeHtml(opts.badge.text)}</div>`
    : "";

  const stockClass = p.is_available ? "badge-success" : "badge-muted";
  const stockText = p.is_available ? t("in_stock") : t("out_of_stock");

  el.innerHTML = `
    ${badgeHtml}
    <div class="product-card__media">
      <img src="${escapeAttrUrl(p.image_url)}" alt="" loading="lazy" />
      <button type="button" class="product-card__fav" aria-label="${t("favorite")}">
        <span class="material-symbols-outlined">favorite</span>
      </button>
    </div>
    <div class="product-card__body">
      <div>
        <p class="product-card__brand">${escapeHtml(p.brand ?? "")}</p>
        <h3 class="product-card__name">${escapeHtml(p.name)}</h3>
      </div>
      <div class="product-card__prices">
        <div class="product-card__price-rub">${formatRub(p.price_rub)}</div>
        <div class="product-card__price-usdt">~ ${formatUsdt(p.price_usdt)} USDT</div>
        <span class="badge ${stockClass} product-card__stock">${stockText}</span>
      </div>
    </div>
  `;

  el.querySelector(".product-card__fav")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  el.addEventListener("click", () => navigate(`/product/${p.id}`));
  return el;
}

function formatRub(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

function formatUsdt(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
