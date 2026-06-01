import type { ProductListItem } from "@poizon-shop/shared";
import { t } from "../i18n/index.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { navigate } from "../router.js";

export function renderProductCard(p: ProductListItem): HTMLElement {
  const el = document.createElement("article");
  el.className = "product-card";
  el.innerHTML = `
    <style>
      .product-card {
        background: var(--color-surface);
        border-radius: var(--radius-card);
        overflow: hidden;
        box-shadow: 0 6px 18px rgba(0,0,0,0.22);
        transition: transform var(--anim-fast);
      }
      .product-card:active { transform: scale(0.98); }
      .product-card img {
        width: 100%; aspect-ratio: 1; object-fit: cover;
        background: var(--color-surface-2);
      }
      .product-card .body { padding: 10px 12px; }
      .product-card .brand { font-size: var(--font-xs); color: var(--color-text-muted); margin: 0; }
      .product-card .name {
        font-size: var(--font-sm); margin: 4px 0 8px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
    </style>
    <img src="${escapeAttrUrl(p.image_url)}" alt="" loading="lazy" />
    <div class="body">
      <p class="brand">${escapeHtml(p.brand)}</p>
      <p class="name">${escapeHtml(p.name)}</p>
      <div class="price-rub">${formatRub(p.price_rub)}</div>
      <div class="price-usdt">${escapeHtml(p.price_usdt)} USDT</div>
      <span class="badge ${p.is_available ? "badge-success" : "badge-muted"}">
        ${p.is_available ? t("in_stock") : t("out_of_stock")}
      </span>
    </div>
  `;
  el.addEventListener("click", () => navigate(`/product/${p.id}`));
  return el;
}

function formatRub(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}
