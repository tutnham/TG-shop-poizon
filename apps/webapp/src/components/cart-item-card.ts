import { apiDelete, apiPatch } from "../api/client.js";
import { t } from "../i18n/index.js";
import { refreshCartBadge } from "../lib/cart-badge.js";
import { notifyCartChanged } from "../lib/cart-presence.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { navigate } from "../router.js";

export type CartLineView = {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  line_rub: number;
  line_usdt: number;
  product: {
    name: string;
    image_url: string | null;
    price_rub?: number;
    price_usdt?: number;
  };
};

export function renderCartItemCard(
  item: CartLineView,
  onChange: () => void | Promise<void>,
): HTMLElement {
  const card = document.createElement("article");
  card.className = "cart-item-card";

  const unitRub = item.product.price_rub ?? item.line_rub / item.quantity;
  const unitUsdt = item.product.price_usdt ?? item.line_usdt / item.quantity;

  card.innerHTML = `
    <button type="button" class="cart-item-card__media" data-product-link>
      <img src="${escapeAttrUrl(item.product.image_url)}" alt="" loading="lazy" />
    </button>
    <div class="cart-item-card__body">
      <h3 class="cart-item-card__name">${escapeHtml(item.product.name)}</h3>
      <p class="cart-item-card__meta">${escapeHtml(item.size)}</p>
      <div class="cart-item-card__prices">
        <span class="price-rub">${formatRub(item.line_rub)}</span>
        <span class="price-usdt">${formatUsdt(item.line_usdt)}</span>
      </div>
      <p class="cart-item-card__unit">${formatRub(unitRub)} · ${formatUsdt(unitUsdt)}</p>
      <div class="cart-item-card__actions">
        <div class="qty-stepper" data-id="${escapeHtml(item.id)}">
          <button type="button" class="qty-stepper__btn" data-action="dec" aria-label="-">−</button>
          <span class="qty-stepper__value">${item.quantity}</span>
          <button type="button" class="qty-stepper__btn" data-action="inc" aria-label="+">+</button>
        </div>
        <button type="button" class="cart-item-card__remove" data-action="remove">${t("cart_remove")}</button>
      </div>
    </div>
  `;

  const stepper = card.querySelector(".qty-stepper") as HTMLElement;

  stepper
    .querySelector('[data-action="dec"]')
    ?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (item.quantity <= 1) {
          await apiDelete(`/api/cart/${item.id}`);
        } else {
          await apiPatch(`/api/cart/${item.id}`, {
            quantity: item.quantity - 1,
          });
        }
        refreshCartBadge();
        notifyCartChanged();
        await onChange();
      } catch {
        window.Telegram?.WebApp?.showAlert(t("error"));
      }
    });

  stepper
    .querySelector('[data-action="inc"]')
    ?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (item.quantity >= 10) return;
      try {
        await apiPatch(`/api/cart/${item.id}`, {
          quantity: item.quantity + 1,
        });
        refreshCartBadge();
        notifyCartChanged();
        await onChange();
      } catch {
        window.Telegram?.WebApp?.showAlert(t("error"));
      }
    });

  card
    .querySelector('[data-action="remove"]')
    ?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await apiDelete(`/api/cart/${item.id}`);
        refreshCartBadge();
        notifyCartChanged();
        await onChange();
      } catch {
        window.Telegram?.WebApp?.showAlert(t("error"));
      }
    });

  card
    .querySelector("[data-product-link]")
    ?.addEventListener("click", () => navigate(`/product/${item.product_id}`));

  return card;
}
