import type { ProductDetail } from "@poizon-shop/shared";
import { apiGet } from "../api/client.js";
import { t } from "../i18n/index.js";
import { addProductToCart } from "../lib/cart-actions.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { showToast } from "../lib/toast.js";
import { getRouteParam, goBack } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import {
  haptic,
  hideMainButton,
  setupBackButton,
  showMainButton,
} from "../telegram.js";

let selectedSize = "";

export async function renderProduct(app: HTMLElement): Promise<void> {
  const id = getRouteParam("id");
  if (!id) return;

  clearPageRoot(app);
  app.classList.remove("page-with-nav");
  const pageRoot = ensurePageRoot(app);
  pageRoot.innerHTML =
    '<div class="page page-tg-content" id="product-page"></div>';
  const page = pageRoot.querySelector("#product-page") as HTMLElement;
  page.innerHTML = `<div class="skeleton" style="height:60vh"></div>`;

  setupBackButton(() => goBack());

  try {
    const { data: p } = await apiGet<{ data: ProductDetail }>(
      `/api/products/${id}`,
    );
    selectedSize = "";
    const sizes = Object.values(p.sizes).flat();
    const stock = p.stock ?? {};

    page.innerHTML = `
      <div class="product-gallery">
        <img src="${escapeAttrUrl(p.image_urls[0] ?? p.image_url)}" alt="" style="width:100%;border-radius:var(--radius-card)" />
      </div>
      <p style="color:var(--color-text-muted);margin:12px 0 4px">${escapeHtml(p.brand)}</p>
      <h2 style="margin:0 0 12px;font-size:var(--font-xl)">${escapeHtml(p.name)}</h2>
      <div class="price-rub" style="font-size:var(--font-lg)">${formatRub(p.price_rub)}</div>
      <div class="price-usdt">${formatUsdt(p.price_usdt)}</div>
      <p style="font-size:var(--font-xs);color:var(--color-text-faint)">${t("markup_note")}</p>
      <h3 class="section-title">${t("select_size")}</h3>
      <div class="size-grid" id="sizes"></div>
    `;

    const grid = page.querySelector("#sizes") as HTMLElement;
    grid.style.cssText =
      "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px";
    for (const s of sizes) {
      const btn = document.createElement("button");
      const available = stock[s] !== false;
      btn.textContent = s;
      btn.className = "chip";
      btn.style.minWidth = "48px";
      if (!available) {
        btn.style.opacity = "0.4";
        btn.style.textDecoration = "line-through";
        btn.disabled = true;
      } else {
        btn.onclick = () => {
          selectedSize = s;
          for (const c of grid.querySelectorAll(".chip"))
            c.classList.remove("active");
          btn.classList.add("active");
        };
      }
      grid.appendChild(btn);
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
      } catch (e) {
        window.Telegram?.WebApp?.showAlert(
          e instanceof Error ? e.message : t("error"),
        );
      }
    });
  } catch {
    page.innerHTML = `<div class="empty-state">${t("error")}</div>`;
    hideMainButton();
  }
}
