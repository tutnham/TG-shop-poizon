import type { OrderListItem } from "@poizon-shop/shared";
import { apiGet } from "../api/client.js";
import { t } from "../i18n/index.js";
import { goBack, navigate } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import { hideMainButton, setupBackButton } from "../telegram.js";

export async function renderOrders(app: HTMLElement): Promise<void> {
  clearPageRoot(app);
  app.classList.add("page-with-nav");
  const pageRoot = ensurePageRoot(app);
  pageRoot.innerHTML = `<div class="page page-tg-content"><h2 class="section-title">${t("orders")}</h2><div id="orders-list"></div></div>`;
  const list = pageRoot.querySelector("#orders-list") as HTMLElement;
  setupBackButton(() => goBack());
  hideMainButton();

  try {
    const { data } = await apiGet<{ data: OrderListItem[] }>("/api/orders");
    if (!data.length) {
      list.innerHTML = `<div class="empty-state">${t("empty_cart_hint")}</div>`;
      return;
    }
    for (const o of data) {
      const card = document.createElement("div");
      card.className = "order-card";
      card.innerHTML = `
        <div class="order-card__header">
          <strong>#${o.id.slice(0, 8)}</strong>
          <span class="badge badge-${statusColor(o.status)}">${t(`order_status_${o.status}`)}</span>
        </div>
        <div class="order-card__total">${o.total_rub} ₽ / ${o.total_usdt} USDT</div>
        <div class="order-card__date">${new Date(o.created_at).toLocaleString()}</div>
      `;
      list.appendChild(card);
    }
  } catch {
    list.innerHTML = `<div class="empty-state">${t("error")}</div>`;
  }
}

function statusColor(status: string): string {
  if (status === "delivered" || status === "paid") return "success";
  if (status === "cancelled") return "muted";
  if (status === "shipped") return "warning";
  return "muted";
}
