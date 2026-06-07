import { apiPost } from "../api/client.js";
import { t } from "../i18n/index.js";
import { escapeHtml } from "../lib/escape.js";
import { goBack, navigate } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import {
  hideMainButton,
  setupBackButton,
  showMainButton,
} from "../telegram.js";

let step = 1;
let paymentMethod: "ton" | "rub_manual" | "usdt_manual" = "ton";
let deliveryData = { full_name: "", phone: "", address: "" };

export async function renderCheckout(app: HTMLElement): Promise<void> {
  step = 1;
  clearPageRoot(app);
  app.classList.remove("page-with-nav");
  const pageRoot = ensurePageRoot(app);
  pageRoot.innerHTML = '<div class="page page-tg-content" id="checkout"></div>';
  const page = pageRoot.querySelector("#checkout") as HTMLElement;
  setupBackButton(() => {
    if (step === 2) {
      step = 1;
      renderStep();
    } else if (step === 3) {
      navigate("/orders");
    } else {
      goBack();
    }
  });
  renderStep();

  function renderStep() {
    if (step === 1) {
      page.innerHTML = `
        <h2 class="section-title">${t("step_delivery")}</h2>
        <div class="checkout-form">
          <label class="checkout-form__field">
            <span class="checkout-form__label">${t("full_name")}</span>
            <input class="checkout-form__input" id="name" type="text" autocomplete="name" />
          </label>
          <label class="checkout-form__field">
            <span class="checkout-form__label">${t("phone")}</span>
            <input class="checkout-form__input" id="phone" type="tel" autocomplete="tel" />
          </label>
          <label class="checkout-form__field">
            <span class="checkout-form__label">${t("address")}</span>
            <textarea class="checkout-form__textarea" id="address" rows="3" autocomplete="street-address"></textarea>
          </label>
        </div>
      `;
      showMainButton("→", () => {
        const name = (
          document.getElementById("name") as HTMLInputElement
        )?.value.trim();
        const phone = (
          document.getElementById("phone") as HTMLInputElement
        )?.value.trim();
        const address = (
          document.getElementById("address") as HTMLTextAreaElement
        )?.value.trim();
        if (!name || !phone || !address) {
          window.Telegram?.WebApp?.showAlert("Fill all fields");
          return;
        }
        deliveryData = { full_name: name, phone, address };
        step = 2;
        renderStep();
      });
    } else if (step === 2) {
      page.innerHTML = `
        <h2 class="section-title">${t("step_payment")}</h2>
        <div class="pay-options">
          <button type="button" class="chip pay-opt active" data-m="ton">${t("pay_ton")}</button>
          <button type="button" class="chip pay-opt" data-m="rub_manual">${t("pay_rub")}</button>
          <button type="button" class="chip pay-opt" data-m="usdt_manual">${t("pay_usdt")}</button>
        </div>
      `;
      for (const btn of page.querySelectorAll(".pay-opt")) {
        btn.addEventListener("click", () => {
          for (const b of page.querySelectorAll(".pay-opt"))
            b.classList.remove("active");
          btn.classList.add("active");
          paymentMethod = (btn as HTMLElement).dataset
            .m as typeof paymentMethod;
        });
      }
      showMainButton(t("place_order"), submitOrder);
    }
  }

  async function submitOrder() {
    const { full_name: name, phone, address } = deliveryData;
    if (!name || !phone || !address) {
      window.Telegram?.WebApp?.showAlert("Fill all fields");
      return;
    }
    try {
      const res = await apiPost<{
        data: {
          short_id: string;
          payment: {
            wallet_comment?: string;
            ton_amount?: number;
            instructions?: string;
          };
          ton_link?: string;
        };
      }>("/api/orders", {
        payment_method: paymentMethod,
        delivery_info: { full_name: name, phone, address, country: "RU" },
      });

      step = 3;
      const d = res.data;
      if (paymentMethod === "ton") {
        page.innerHTML = `
          <h2 class="section-title">${t("step_payment")}</h2>
          <p>${t("ton_instruction")}</p>
          <p><strong>${escapeHtml(d.payment.wallet_comment)}</strong></p>
          <p>TON: ${escapeHtml(d.payment.ton_amount ?? "—")}</p>
          ${d.ton_link ? `<button class="btn-primary" id="open-wallet">${t("open_wallet")}</button>` : ""}
          <button class="chip checkout-form__secondary-btn" id="to-orders">${t("orders")}</button>
        `;
        page.querySelector("#open-wallet")?.addEventListener("click", () => {
          if (d.ton_link) window.Telegram?.WebApp?.openLink(d.ton_link);
        });
      } else {
        page.innerHTML = `
          <h2 class="section-title">${t("step_payment")}</h2>
          <p>${t("manual_instruction")}</p>
          <p><strong>#${escapeHtml(d.short_id)}</strong></p>
          <p>${escapeHtml(d.payment.instructions ?? "")}</p>
          <button class="chip checkout-form__secondary-btn" id="to-orders">${t("orders")}</button>
        `;
      }
      page
        .querySelector("#to-orders")
        ?.addEventListener("click", () => navigate("/orders"));
      hideMainButton();
      window.Telegram?.WebApp?.showAlert(`Order #${d.short_id}`);
    } catch (e) {
      window.Telegram?.WebApp?.showAlert(
        e instanceof Error ? e.message : t("error"),
      );
    }
  }
}
