import type { ProductListItem } from "@poizon-shop/shared";
import { isDemoProductId } from "../data/demo-products.js";
import { t } from "../i18n/index.js";
import { isProductInCartSync } from "../lib/cart-presence.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { hideKeyboard } from "../lib/keyboard.js";
import { navigate } from "../router.js";

export type ProductCardBadge = {
  text: string;
  variant?: "top" | "new";
};

function createInCartBadge(): HTMLElement {
  const mark = document.createElement("span");
  mark.className = "product-card__in-cart";
  mark.setAttribute("aria-label", t("in_cart"));
  mark.innerHTML = `<span class="material-symbols-outlined">check_circle</span>`;
  return mark;
}

function createAddButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "product-card__add";
  btn.setAttribute("aria-label", t("add_to_cart"));
  btn.innerHTML = `<span class="material-symbols-outlined">add_shopping_cart</span>`;
  return btn;
}

function bindAddButton(
  el: HTMLElement,
  p: ProductListItem,
  addBtn: HTMLButtonElement,
): void {
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!p.is_available) return;
    hideKeyboard();
    navigate(`/product/${p.id}`);
  });
}

function applyCardCartState(
  el: HTMLElement,
  p: ProductListItem,
  inCart: boolean,
): void {
  const media = el.querySelector(".product-card__media");
  if (!media) return;

  const badge = media.querySelector(".product-card__in-cart");
  let addBtn = media.querySelector(
    ".product-card__add",
  ) as HTMLButtonElement | null;

  if (inCart) {
    addBtn?.remove();
    if (!badge) media.appendChild(createInCartBadge());
    return;
  }

  badge?.remove();
  if (!p.is_available) {
    addBtn?.remove();
    return;
  }
  if (!addBtn) {
    addBtn = createAddButton();
    media.appendChild(addBtn);
    bindAddButton(el, p, addBtn);
  }
  addBtn.disabled = false;
  addBtn.classList.remove("product-card__add--loading");
}

export function renderProductCard(
  p: ProductListItem,
  opts?: { badge?: ProductCardBadge; demo?: boolean },
): HTMLElement {
  const el = document.createElement("article");
  const isDemo = Boolean(opts?.demo || isDemoProductId(p.id));
  el.className = `product-card${isDemo ? " product-card--demo" : ""}`;
  el.dataset.productId = p.id;
  const inCart = isProductInCartSync(p.id);

  const badgeHtml = isDemo
    ? `<div class="product-card__badge product-card__badge--demo">${escapeHtml(t("demo_badge"))}</div>`
    : opts?.badge
      ? `<div class="product-card__badge${opts.badge.variant === "new" ? " product-card__badge--new" : ""}">${escapeHtml(opts.badge.text)}</div>`
      : "";

  const stockClass = p.is_available ? "badge-success" : "badge-muted";
  const stockText = p.is_available ? t("in_stock") : t("out_of_stock");

  const mediaActionHtml = inCart
    ? `<span class="product-card__in-cart" aria-label="${t("in_cart")}"><span class="material-symbols-outlined">check_circle</span></span>`
    : p.is_available
      ? `<button type="button" class="product-card__add" aria-label="${t("add_to_cart")}">
          <span class="material-symbols-outlined">add_shopping_cart</span>
        </button>`
      : "";

  el.innerHTML = `
    ${badgeHtml}
    <div class="product-card__media">
      <img src="${escapeAttrUrl(p.image_url)}" alt="" width="400" height="400" loading="lazy" decoding="async" />
      <button type="button" class="product-card__fav" aria-label="${t("favorite")}">
        <span class="material-symbols-outlined">favorite</span>
      </button>
      ${mediaActionHtml}
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

  const refresh = () => {
    if (!el.isConnected) {
      window.removeEventListener("poizon-cart-changed", refresh);
      return;
    }
    applyCardCartState(el, p, isProductInCartSync(p.id));
  };
  window.addEventListener("poizon-cart-changed", refresh);

  el.querySelector(".product-card__fav")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  const addBtn = el.querySelector(
    ".product-card__add",
  ) as HTMLButtonElement | null;
  if (addBtn) bindAddButton(el, p, addBtn);

  el.addEventListener("click", () => {
    hideKeyboard();
    navigate(`/product/${p.id}`);
  });

  return el;
}
