import type { ProductDetail } from "@poizon-shop/shared";
import { isDemoProductId } from "../data/demo-products.js";
import { t } from "../i18n/index.js";
import { addProductToCart } from "../lib/cart-actions.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { showToast } from "../lib/toast.js";
import { navigate } from "../router.js";
import { haptic, showMainButton } from "../telegram.js";

let selectedSize = "";

export function renderProductDetailView(
  page: HTMLElement,
  p: ProductDetail,
): void {
  selectedSize = "";
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
  `;

  const grid = page.querySelector("#sizes") as HTMLElement;
  for (const s of sizes) {
    const btn = document.createElement("button");
    const available = stock[s] !== false;
    btn.type = "button";
    btn.textContent = s;
    btn.className = "chip";
    if (!available) {
      btn.classList.add("chip--disabled");
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => {
        selectedSize = s;
        for (const c of grid.querySelectorAll(".chip")) {
          c.classList.remove("active");
        }
        btn.classList.add("active");
      });
    }
    grid.appendChild(btn);
  }

  if (sizes.length === 1 && stock[sizes[0]] !== false) {
    const only = grid.querySelector(".chip") as HTMLButtonElement | null;
    only?.click();
  }

  showMainButton(t("add_to_cart"), async () => {
    if (!selectedSize) {
      window.Telegram?.WebApp?.showAlert(t("select_size"));
      return;
    }
    try {
      await addProductToCart(p.id, 1, selectedSize);
      haptic("success");
      showToast(t("added_to_cart"));
      navigate("/cart");
    } catch (e) {
      window.Telegram?.WebApp?.showAlert(
        e instanceof Error ? e.message : t("error"),
      );
    }
  });
}
