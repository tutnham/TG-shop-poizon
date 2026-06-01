import { apiPost } from "../api/client.js";
import { t } from "../i18n/index.js";
import { escapeHtml } from "../lib/escape.js";
import { goBack, navigate } from "../router.js";
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
  app.innerHTML =
    '<div class="page page-tg-content" id="checkout"></div>';
  const page = app.querySelector("#checkout") as HTMLElement;
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
        <label>${t("full_name")}<input id="name" /></label>
        <label style="display:block;margin-top:12px">${t("phone")}<input id="phone" type="tel" /></label>
        <label style="display:block;margin-top:12px">${t("address")}<textarea id="address" rows="3"></textarea></label>
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
        <div class="pay-options" style="display:flex;flex-direction:column;gap:10px">
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
          <button class="chip" id="to-orders" style="margin-top:16px">${t("orders")}</button>
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
          <button class="chip" id="to-orders" style="margin-top:16px">${t("orders")}</button>
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
