import { renderCartItemCard } from "../components/cart-item-card.js";
import { t } from "../i18n/index.js";
import { refreshCartBadge } from "../lib/cart-badge.js";
import { loadCartSnapshot } from "../lib/cart-store.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { goBack, navigate } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import {
  hideMainButton,
  setupBackButton,
  showMainButton,
} from "../telegram.js";

export async function renderCart(app: HTMLElement): Promise<void> {
  clearPageRoot(app);
  app.classList.add("page-with-nav");
  const pageRoot = ensurePageRoot(app);
  pageRoot.innerHTML = `
    <div class="page page-tg-content cart-page">
      <h2 class="section-title">${t("cart")}</h2>
      <div id="cart-list" class="cart-page__list"></div>
      <div id="cart-summary" class="cart-summary" hidden></div>
    </div>
  `;

  const list = pageRoot.querySelector("#cart-list") as HTMLElement;
  const summary = pageRoot.querySelector("#cart-summary") as HTMLElement;

  setupBackButton(() => goBack());
  refreshCartBadge();

  const rerender = () => renderCart(app);

  const snapshot = await loadCartSnapshot();

  if (!snapshot.lines.length) {
    list.innerHTML = `
      <div class="empty-state cart-page__empty">
        <span class="material-symbols-outlined cart-page__empty-icon">shopping_cart</span>
        <p>${t("empty_cart")}</p>
        <p>${t("empty_cart_hint")}</p>
        <button type="button" class="btn-primary" id="to-cat">${t("to_catalog")}</button>
      </div>`;
    list
      .querySelector("#to-cat")
      ?.addEventListener("click", () => navigate("/"));
    summary.hidden = true;
    hideMainButton();
    return;
  }

  list.innerHTML = "";
  for (const item of snapshot.lines) {
    list.appendChild(renderCartItemCard(item, rerender));
  }

  summary.hidden = false;
  summary.innerHTML = `
    <div class="cart-summary__row">
      <span>${snapshot.lines.length} ${t("cart_items")}</span>
    </div>
    <div class="cart-summary__totals">
      <div class="cart-summary__price">
        <span class="cart-summary__label">${t("total")}</span>
        <span class="price-rub cart-summary__rub">${formatRub(snapshot.total_rub)}</span>
        <span class="price-usdt cart-summary__usdt">${formatUsdt(snapshot.total_usdt)}</span>
      </div>
    </div>
  `;

  if (snapshot.apiFailed) {
    const note = document.createElement("p");
    note.className = "cart-summary__demo-note";
    note.textContent = t("demo_cart_note");
    summary.appendChild(note);
    hideMainButton();
  } else {
    showMainButton(t("proceed_checkout"), () => navigate("/checkout"));
  }
}
