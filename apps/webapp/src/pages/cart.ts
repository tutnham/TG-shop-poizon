import { apiDelete, apiGet } from "../api/client.js";
import { t } from "../i18n/index.js";
import { escapeAttrUrl, escapeHtml } from "../lib/escape.js";
import { goBack, navigate } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import {
  hideMainButton,
  setupBackButton,
  showMainButton,
} from "../telegram.js";

type CartLine = {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  line_rub: number;
  line_usdt: number;
  product: { name: string; image_url: string | null };
};

export async function renderCart(app: HTMLElement): Promise<void> {
  clearPageRoot(app);
  app.classList.add("page-with-nav");
  const pageRoot = ensurePageRoot(app);
  pageRoot.innerHTML = `<div class="page page-tg-content"><h2 class="section-title">${t("cart")}</h2><div id="cart-list"></div></div>`;
  const list = pageRoot.querySelector("#cart-list") as HTMLElement;

  setupBackButton(() => goBack());

  try {
    const res = await apiGet<{
      data: CartLine[];
      total_rub: number;
      total_usdt: number;
    }>("/api/cart");

    if (!res.data.length) {
      list.innerHTML = `
        <div class="empty-state">
          <p>${t("empty_cart")}</p>
          <p>${t("empty_cart_hint")}</p>
          <button class="btn-primary" id="to-cat">${t("to_catalog")}</button>
        </div>`;
      list
        .querySelector("#to-cat")
        ?.addEventListener("click", () => navigate("/"));
      hideMainButton();
      return;
    }

    for (const item of res.data) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--color-border)";
      row.innerHTML = `
        <img src="${escapeAttrUrl(item.product.image_url)}" style="width:72px;height:72px;border-radius:12px;object-fit:cover" />
        <div style="flex:1">
          <div>${escapeHtml(item.product.name)}</div>
          <div style="color:var(--color-text-muted);font-size:var(--font-sm)">${escapeHtml(item.size)} × ${escapeHtml(item.quantity)}</div>
          <div class="price-rub">${escapeHtml(item.line_rub)} ₽</div>
          <button type="button" data-id="${escapeHtml(item.id)}" style="color:var(--color-danger);font-size:var(--font-sm);margin-top:8px">✕</button>
        </div>
      `;
      row.querySelector("button")?.addEventListener("click", async () => {
        await apiDelete(`/api/cart/${item.id}`);
        await renderCart(app);
      });
      list.appendChild(row);
    }

    const total = document.createElement("div");
    total.style.marginTop = "16px";
    total.innerHTML = `
      <div>${t("total")}</div>
      <div class="price-rub">${escapeHtml(res.total_rub.toLocaleString())} ₽</div>
      <div class="price-usdt">${escapeHtml(res.total_usdt)} USDT</div>
    `;
    list.appendChild(total);

    showMainButton(t("proceed_checkout"), () => navigate("/checkout"));
  } catch {
    list.innerHTML = `<div class="empty-state">${t("error")}</div>`;
    hideMainButton();
  }
}
