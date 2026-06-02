import type { ProductDetail } from "@poizon-shop/shared";
import { apiDelete } from "../api/client.js";
import { isDemoProductId } from "../data/demo-products.js";
import { t } from "../i18n/index.js";
import { addProductToCart } from "../lib/cart-actions.js";
import {
  isProductInCart,
  loadCartLines,
} from "../lib/cart-presence.js";
import { refreshCartBadge } from "../lib/cart-badge.js";
import { removeDemoCartLineByProduct } from "../lib/demo-cart.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { showToast } from "../lib/toast.js";
import { navigate } from "../router.js";
import { haptic, hideMainButton } from "../telegram.js";

type ProductDetailState = {
  productId: string;
  size: string;
  session: number;
  adding: boolean;
};

let detailSession = 0;

function isStale(state: ProductDetailState): boolean {
  return state.session !== detailSession;
}

async function handleAdd(
  page: HTMLElement,
  p: ProductDetail,
  state: ProductDetailState,
  addBtn: HTMLButtonElement,
): Promise<void> {
  if (state.adding || isStale(state)) return;
  if (!state.size) {
    window.Telegram?.WebApp?.showAlert(t("select_size"));
    return;
  }
  state.adding = true;
  addBtn.disabled = true;
  try {
    await addProductToCart(p.id, 1, state.size);
    haptic("success");
    showToast(t("added_to_cart"));
    if (isStale(state)) return;
    navigate("/cart");
  } catch (e) {
    window.Telegram?.WebApp?.showAlert(
      e instanceof Error ? e.message : t("error"),
    );
    if (!isStale(state)) {
      addBtn.disabled = false;
      state.adding = false;
    }
  }
}

async function handleRemove(
  page: HTMLElement,
  p: ProductDetail,
  state: ProductDetailState,
): Promise<void> {
  if (!state.size || state.adding || isStale(state)) return;

  if (isDemoProductId(p.id)) {
    removeDemoCartLineByProduct(p.id, state.size);
    haptic("light");
    showToast(t("removed_from_cart"));
    refreshCartBadge();
    await syncProductActions(page, p, state);
    return;
  }

  const lines = await loadCartLines();
  if (isStale(state)) return;
  const line = lines.find(
    (l) =>
      l.product_id === p.id && String(l.size) === String(state.size),
  );
  if (!line) {
    window.Telegram?.WebApp?.showAlert(t("error"));
    return;
  }
  try {
    await apiDelete(`/api/cart/${line.id}`);
    haptic("light");
    showToast(t("removed_from_cart"));
    refreshCartBadge();
    await syncProductActions(page, p, state);
  } catch {
    window.Telegram?.WebApp?.showAlert(t("error"));
  }
}

async function syncProductActions(
  page: HTMLElement,
  p: ProductDetail,
  state: ProductDetailState,
): Promise<void> {
  const hint = page.querySelector("#size-hint") as HTMLElement | null;
  const addBtn = page.querySelector(
    "#product-add-btn",
  ) as HTMLButtonElement | null;
  const removeBtn = page.querySelector(
    "#product-remove-btn",
  ) as HTMLButtonElement | null;
  const inCartBlock = page.querySelector(
    "#product-in-cart",
  ) as HTMLElement | null;

  if (!addBtn || !removeBtn || !inCartBlock) return;

  hideMainButton();

  if (!state.size) {
    addBtn.hidden = true;
    removeBtn.hidden = true;
    inCartBlock.hidden = true;
    addBtn.disabled = false;
    state.adding = false;
    if (hint) {
      hint.hidden = false;
      hint.textContent = t("select_size_hint");
    }
    return;
  }

  if (isStale(state)) return;

  const inCart = await isProductInCart(p.id, state.size);
  if (isStale(state)) return;

  if (hint) hint.hidden = true;
  state.adding = false;

  if (inCart) {
    addBtn.hidden = true;
    addBtn.disabled = false;
    removeBtn.hidden = false;
    inCartBlock.hidden = false;
    const sizeEl = inCartBlock.querySelector(".product-detail__in-cart-size");
    if (sizeEl) sizeEl.textContent = state.size;
    return;
  }

  inCartBlock.hidden = true;
  addBtn.hidden = false;
  removeBtn.hidden = true;
  addBtn.disabled = false;
}

export function renderProductDetailView(
  page: HTMLElement,
  p: ProductDetail,
): void {
  detailSession += 1;
  const state: ProductDetailState = {
    productId: p.id,
    size: "",
    session: detailSession,
    adding: false,
  };

  const sizes = Object.values(p.sizes ?? {}).flat();
  const stock = p.stock ?? {};
  const isDemo = isDemoProductId(p.id);

  page.innerHTML = `
    ${isDemo ? `<p class="demo-product-banner">${escapeHtml(t("demo_mode_hint"))}</p>` : ""}
    <div class="product-gallery">
      <img src="${escapeAttrUrl(p.image_urls[0] ?? p.image_url)}" alt="" class="product-gallery__img" />
    </div>
    <p class="product-detail__brand">${escapeHtml(p.brand ?? "")}</p>
    <h2 class="product-detail__title">${escapeHtml(p.name)}</h2>
    <div class="product-detail__prices">
      <div class="price-rub product-detail__price-rub">${formatRub(p.price_rub)}</div>
      <div class="price-usdt">${formatUsdt(p.price_usdt)}</div>
    </div>
    <p class="product-detail__note">${t("markup_note")}</p>
    <h3 class="section-title">${t("select_size")}</h3>
    <div class="size-grid" id="sizes"></div>
    <p class="product-detail__size-hint" id="size-hint">${t("select_size_hint")}</p>
    <div class="product-detail__actions">
      <div class="product-detail__in-cart" id="product-in-cart" hidden>
        <span class="material-symbols-outlined">check_circle</span>
        <span>${t("in_cart")} · <span class="product-detail__in-cart-size"></span></span>
        <button type="button" class="product-detail__in-cart-link" id="view-cart-link">${t("view_cart")}</button>
      </div>
      <button type="button" class="btn-primary product-detail__add-btn" id="product-add-btn" hidden>
        ${t("add_to_cart")}
      </button>
      <button type="button" class="btn-secondary product-detail__remove-btn" id="product-remove-btn" hidden>
        ${t("remove_from_cart")}
      </button>
    </div>
  `;

  const addBtn = page.querySelector(
    "#product-add-btn",
  ) as HTMLButtonElement;
  const removeBtn = page.querySelector(
    "#product-remove-btn",
  ) as HTMLButtonElement;

  addBtn.addEventListener("click", () => void handleAdd(page, p, state, addBtn));
  removeBtn.addEventListener("click", () => void handleRemove(page, p, state));
  page
    .querySelector("#view-cart-link")
    ?.addEventListener("click", () => navigate("/cart"));

  const grid = page.querySelector("#sizes") as HTMLElement;
  const selectSize = (size: string, chip: HTMLButtonElement) => {
    if (isStale(state)) return;
    state.size = size;
    for (const c of grid.querySelectorAll(".chip")) {
      c.classList.remove("active");
    }
    chip.classList.add("active");
    void syncProductActions(page, p, state);
  };

  for (const s of sizes) {
    const btn = document.createElement("button");
    const available = stock[s] !== false;
    btn.type = "button";
    btn.textContent = s;
    btn.className = "chip";
    btn.dataset.size = s;
    if (!available) {
      btn.classList.add("chip--disabled");
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => selectSize(s, btn));
    }
    grid.appendChild(btn);
  }

  const firstAvailable = sizes.find((s) => stock[s] !== false);
  if (firstAvailable) {
    const chip = grid.querySelector<HTMLButtonElement>(
      `[data-size="${firstAvailable}"]`,
    );
    if (chip) selectSize(firstAvailable, chip);
  } else {
    void syncProductActions(page, p, state);
  }
}
