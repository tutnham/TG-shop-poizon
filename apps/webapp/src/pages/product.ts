import type { ProductDetail } from "@poizon-shop/shared";
import { apiGet } from "../api/client.js";
import { hideBottomNav } from "../components/bottom-nav.js";
import { renderProductDetailView } from "../components/product-detail-view.js";
import { t } from "../i18n/index.js";
import { getRouteParam, goBack } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import {
  hideBackButton,
  hideMainButton,
  setupBackButton,
} from "../telegram.js";

const PRODUCT_PAGE_ID = "product-page";

export async function renderProduct(app: HTMLElement): Promise<void> {
  const id = getRouteParam("id");
  if (!id) return;

  hideBottomNav(app);
  clearPageRoot(app);
  app.classList.remove("page-with-nav");
  const pageRoot = ensurePageRoot(app);
  pageRoot.innerHTML = `<div class="page page-tg-content page-tg-content--scroll" id="${PRODUCT_PAGE_ID}"></div>`;
  const page = pageRoot.querySelector<HTMLElement>(
    `#${PRODUCT_PAGE_ID}`,
  ) as HTMLElement;
  page.innerHTML = `<div class="skeleton" style="height:60vh"></div>`;

  setupBackButton(() => goBack());

  try {
    const { data: p } = await apiGet<{ data: ProductDetail }>(
      `/api/products/${id}`,
    );
    renderProductDetailView(page, p);
  } catch {
    page.innerHTML = `<div class="empty-state">${t("error")}</div>`;
    hideMainButton();
  }
}
