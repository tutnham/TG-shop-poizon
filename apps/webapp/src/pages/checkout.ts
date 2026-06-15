import { apiPost } from "../api/client.js";
import { t } from "../i18n/index.js";
import { escapeHtml } from "../lib/escape.js";
import { setKeyboardDismissPaused } from "../lib/keyboard.js";
import { goBack, navigate } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import {
  hideMainButton,
  setupBackButton,
  showMainButton,
} from "../telegram.js";

let step = 1;
let deliveryData = { full_name: "", phone: "", address: "" };

function leaveCheckout(): void {
  setKeyboardDismissPaused(false);
}

export async function renderCheckout(app: HTMLElement): Promise<void> {
  step = 1;
  setKeyboardDismissPaused(true);
  clearPageRoot(app);
  app.classList.remove("page-with-nav");
  const pageRoot = ensurePageRoot(app);
  pageRoot.innerHTML =
    '<div class="page page-tg-content page-tg-content--scroll" id="checkout"></div>';
  const page = pageRoot.querySelector("#checkout") as HTMLElement;
  setupBackButton(() => {
    if (step === 2) {
      leaveCheckout();
      navigate("/orders");
    } else {
      leaveCheckout();
      goBack();
    }
  });
  renderStep();

  function renderStep() {
    if (step === 1) {
      page.innerHTML = `
        <h2 class="section-title">${t("step_delivery")}</h2>
        <p class="checkout-form__hint">${t("order_admin_hint")}</p>
        <div class="checkout-form">
          <label class="checkout-form__field" for="checkout-name">
            <span class="checkout-form__label">${t("full_name")}</span>
            <input
              class="checkout-form__input"
              id="checkout-name"
              name="full_name"
              type="text"
              autocomplete="name"
              enterkeyhint="next"
              value="${escapeHtml(deliveryData.full_name)}"
            />
          </label>
          <label class="checkout-form__field" for="checkout-phone">
            <span class="checkout-form__label">${t("phone")}</span>
            <input
              class="checkout-form__input"
              id="checkout-phone"
              name="phone"
              type="tel"
              autocomplete="tel"
              enterkeyhint="next"
              inputmode="tel"
              value="${escapeHtml(deliveryData.phone)}"
            />
          </label>
          <label class="checkout-form__field" for="checkout-address">
            <span class="checkout-form__label">${t("address")}</span>
            <textarea
              class="checkout-form__textarea"
              id="checkout-address"
              name="address"
              rows="3"
              autocomplete="street-address"
              enterkeyhint="done"
            >${escapeHtml(deliveryData.address)}</textarea>
          </label>
        </div>
      `;
      showMainButton(t("place_order"), submitOrder);
    }
  }

  async function submitOrder() {
    const name = (
      document.getElementById("checkout-name") as HTMLInputElement | null
    )?.value.trim();
    const phone = (
      document.getElementById("checkout-phone") as HTMLInputElement | null
    )?.value.trim();
    const address = (
      document.getElementById("checkout-address") as HTMLTextAreaElement | null
    )?.value.trim();

    if (!name || !phone || !address) {
      window.Telegram?.WebApp?.showAlert(t("fill_all_fields"));
      return;
    }

    deliveryData = { full_name: name, phone, address };

    try {
      const res = await apiPost<{
        data: { short_id: string };
      }>("/api/orders", {
        payment_method: "none",
        delivery_info: { full_name: name, phone, address, country: "RU" },
      });

      step = 2;
      leaveCheckout();
      const shortId = res.data.short_id;
      page.innerHTML = `
        <h2 class="section-title">${t("order_success_title")}</h2>
        <p>${t("order_success_text")}</p>
        <p><strong>#${escapeHtml(shortId)}</strong></p>
        <button type="button" class="chip checkout-form__secondary-btn" id="to-orders">${t("orders")}</button>
      `;
      page
        .querySelector("#to-orders")
        ?.addEventListener("click", () => navigate("/orders"));
      hideMainButton();
    } catch (e) {
      window.Telegram?.WebApp?.showAlert(
        e instanceof Error ? e.message : t("error"),
      );
    }
  }
}
