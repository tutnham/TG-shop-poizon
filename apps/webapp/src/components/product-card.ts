import type { ProductListItem } from "@poizon-shop/shared";
import { t } from "../i18n/index.js";
import { addProductToCartWithFeedback } from "../lib/cart-actions.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { hideKeyboard } from "../lib/keyboard.js";
import { showToast } from "../lib/toast.js";
import { navigate } from "../router.js";
import { haptic } from "../telegram.js";

export type ProductCardBadge = {
  text: string;
  variant?: "top" | "new";
};

export function renderProductCard(
  p: ProductListItem,
  opts?: { badge?: ProductCardBadge; demo?: boolean },
): HTMLElement {
  const el = document.createElement("article");
  el.className = `product-card${opts?.demo ? " product-card--demo" : ""}`;

  const badgeHtml = opts?.demo
    ? `<div class="product-card__badge product-card__badge--demo">${escapeHtml(t("demo_badge"))}</div>`
    : opts?.badge
      ? `<div class="product-card__badge${opts.badge.variant === "new" ? " product-card__badge--new" : ""}">${escapeHtml(opts.badge.text)}</div>`
      : "";

  const stockClass = p.is_available ? "badge-success" : "badge-muted";
  const stockText = p.is_available ? t("in_stock") : t("out_of_stock");

  el.innerHTML = `
    ${badgeHtml}
    <div class="product-card__media">
      <img src="${escapeAttrUrl(p.image_url)}" alt="" loading="lazy" decoding="async" />
      <button type="button" class="product-card__fav" aria-label="${t("favorite")}">
        <span class="material-symbols-outlined">favorite</span>
      </button>
      <button type="button" class="product-card__add" aria-label="${t("add_to_cart")}" ${p.is_available ? "" : "disabled"}>
        <span class="material-symbols-outlined">add_shopping_cart</span>
      </button>
    </div>
    <div class="product-card__body">
      <div>
        <p class="product-card__brand">${escapeHtml(p.brand ?? "")}</p>
        <h3 class="product-card__name">${escapeHtml(p.name)}</h3>
      </div>
      <div class="product-card__prices">
        <div class="product-card__price-rub">${formatRub(p.price_rub)}</div>
        <div class="product-card__price-usdt">${formatUsdt(p.price_usdt)}</div>
        <span class="badge ${stockClass} product-card__stock">${stockText}</span>
      </div>
    </div>
  `;

  el.querySelector(".product-card__fav")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  const addBtn = el.querySelector(
    ".product-card__add",
  ) as HTMLButtonElement | null;
  addBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (opts?.demo) {
      showToast(t("demo_preview_toast"));
      return;
    }
    if (!p.is_available || addBtn.disabled) return;
    addBtn.disabled = true;
    addBtn.classList.add("product-card__add--loading");
    void addProductToCartWithFeedback(p.id)
      .then(() => haptic("success"))
      .catch(() => haptic("light"))
      .finally(() => {
        addBtn.disabled = !p.is_available;
        addBtn.classList.remove("product-card__add--loading");
      });
  });

  el.addEventListener("click", () => {
    hideKeyboard();
    if (opts?.demo) {
      showToast(t("demo_preview_toast"));
      return;
    }
    navigate(`/product/${p.id}`);
  });

  return el;
}
