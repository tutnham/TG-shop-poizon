import type { ProductDetail } from "@poizon-shop/shared";
import { apiGet } from "../api/client.js";
import { renderProductDetailView } from "../components/product-detail-view.js";
import {
  getDemoProductDetail,
  isDemoProductId,
} from "../data/demo-products.js";
import { t } from "../i18n/index.js";
import { getRouteParam, goBack } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import { hideMainButton, setupBackButton } from "../telegram.js";

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
    if (isDemoProductId(id)) {
      const demo = getDemoProductDetail(id);
      if (!demo) {
        page.innerHTML = `<div class="empty-state">${t("error")}</div>`;
        hideMainButton();
        return;
      }
      renderProductDetailView(page, demo);
      return;
    }

    const { data: p } = await apiGet<{ data: ProductDetail }>(
      `/api/products/${id}`,
    );
    renderProductDetailView(page, p);
  } catch {
    page.innerHTML = `<div class="empty-state">${t("error")}</div>`;
    hideMainButton();
  }
}
