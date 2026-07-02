import type { OrderDetail, OrderListItem } from "@poizon-shop/shared";
import { apiGetFresh } from "../api/client.js";
import { t } from "../i18n/index.js";
import { escapeHtml } from "../lib/escape.js";
import { formatRub, formatUsdt } from "../lib/format-price.js";
import { getRouteParam, goBack, navigate } from "../router.js";
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
    const { data } = await apiGetFresh<{ data: OrderListItem[] }>(
      "/api/orders",
    );
    if (!data.length) {
      list.innerHTML = `<div class="empty-state">${t("empty_orders")}</div>`;
      return;
    }
    for (const o of data) {
      const card = document.createElement("div");
      card.className = "order-card";
      card.innerHTML = `
        <div class="order-card__header">
          <strong>#${escapeHtml(o.short_id)}</strong>
          <span class="badge badge-${statusColor(o.status)}">${t(`order_status_${o.status}`)}</span>
        </div>
        <div class="order-card__total">${formatRub(o.total_rub)} / ${formatUsdt(o.total_usdt)}</div>
        <div class="order-card__date">${new Date(o.created_at).toLocaleString()}</div>
      `;
      card.addEventListener("click", () => navigate(`/orders/${o.id}`));
      card.style.cursor = "pointer";
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

function paymentLabel(method: string | null): string {
  if (method === "none" || !method) return "—";
  if (method === "ton") return t("pay_ton");
  if (method === "rub_manual") return t("pay_rub");
  if (method === "usdt_manual") return t("pay_usdt");
  return method;
}

export async function renderOrderDetail(app: HTMLElement): Promise<void> {
  const id = getRouteParam("id");
  if (!id) {
    navigate("/orders");
    return;
  }

  clearPageRoot(app);
  app.classList.remove("page-with-nav");
  const pageRoot = ensurePageRoot(app);
  pageRoot.innerHTML =
    '<div class="page page-tg-content" id="order-detail-page"><div class="skeleton" style="height:60vh"></div></div>';
  const page = pageRoot.querySelector("#order-detail-page") as HTMLElement;

  setupBackButton(() => navigate("/orders"));
  hideMainButton();

  try {
    const { data: o } = await apiGetFresh<{ data: OrderDetail }>(
      `/api/orders/${id}`,
    );

    const itemsHtml = (o.items ?? [])
      .map(
        (item) => `
        <div class="order-detail__item">
          <div class="order-detail__item-info">
            <div class="order-detail__item-name">${escapeHtml(item.name)}</div>
            <div class="order-detail__item-meta">${escapeHtml(item.brand ?? "")} · ${escapeHtml(item.size)} · ×${item.quantity}</div>
          </div>
          <div class="order-detail__item-price">
            <span class="price-rub">${formatRub(item.price_rub)}</span>
            <span class="price-usdt">${formatUsdt(item.price_usdt)}</span>
          </div>
        </div>
      `,
      )
      .join("");

    const delivery = o.delivery_info;
    const deliveryHtml = delivery
      ? `
        <div class="order-detail__section">
          <h3 class="order-detail__section-title">${t("delivery")}</h3>
          <p>${escapeHtml(delivery.full_name)}</p>
          <p>${escapeHtml(delivery.phone)}</p>
          <p>${escapeHtml(delivery.address)}</p>
        </div>
      `
      : "";

    page.innerHTML = `
      <div class="order-detail__header">
        <h2>${t("order")} #${escapeHtml(o.short_id)}</h2>
        <span class="badge badge-${statusColor(o.status)}">${t(`order_status_${o.status}`)}</span>
      </div>
      <div class="order-detail__meta">
        <span>${new Date(o.created_at).toLocaleString()}</span>
        ${o.payment_method && o.payment_method !== "none" ? `<span>${t("payment")}: ${paymentLabel(o.payment_method)}</span>` : ""}
      </div>
      ${deliveryHtml}
      <div class="order-detail__section">
        <h3 class="order-detail__section-title">${t("cart_items")} (${o.items_count})</h3>
        <div class="order-detail__items">${itemsHtml}</div>
      </div>
      <div class="order-detail__total">
        <span>${t("total")}</span>
        <span class="price-rub">${formatRub(o.total_rub)}</span>
        <span class="price-usdt">${formatUsdt(o.total_usdt)}</span>
      </div>
      ${o.tracking_number ? `<p class="order-detail__tracking">${t("tracking")}: ${escapeHtml(o.tracking_number)}</p>` : ""}
    `;
  } catch {
    page.innerHTML = `<div class="empty-state">${t("error")}</div>`;
  }
}
