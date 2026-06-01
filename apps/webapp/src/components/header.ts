import { apiPatch } from "../api/client.js";
import { type Lang, getLang, setLang, t } from "../i18n/index.js";
import { navigate } from "../router.js";

export function renderHeader(
  root: HTMLElement,
  opts?: { showSearch?: boolean },
): void {
  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <style>
      .app-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px var(--page-padding);
        background: rgba(15, 17, 21, 0.92);
        backdrop-filter: blur(8px);
        position: sticky;
        top: 0;
        z-index: 10;
        min-height: 52px;
      }
      .app-header h1 { font-size: var(--font-lg); margin: 0; font-weight: 700; }
      .header-actions { display: flex; gap: 8px; align-items: center; }
      .icon-btn {
        min-width: 44px; min-height: 44px;
        display: flex; align-items: center; justify-content: center;
        background: var(--color-surface-2);
        border-radius: 12px;
        font-size: var(--font-sm);
      }
    </style>
    <h1>${t("shop")}</h1>
    <div class="header-actions">
      <button type="button" class="icon-btn" id="lang-btn">${t("lang")}</button>
      <button type="button" class="icon-btn" id="orders-btn">📋</button>
      <button type="button" class="icon-btn" id="cart-btn">🛒</button>
    </div>
  `;
  root.prepend(header);

  header
    .querySelector("#cart-btn")
    ?.addEventListener("click", () => navigate("/cart"));
  header
    .querySelector("#orders-btn")
    ?.addEventListener("click", () => navigate("/orders"));
  header.querySelector("#lang-btn")?.addEventListener("click", async () => {
    const next: Lang = getLang() === "ru" ? "en" : "ru";
    setLang(next);
    try {
      await apiPatch("/api/user/language", { language_code: next });
    } catch {
      /* offline ok */
    }
    window.location.reload();
  });

  if (opts?.showSearch) {
    const search = document.createElement("div");
    search.style.padding = "0 var(--page-padding) 12px";
    search.innerHTML = `<input type="search" id="search-input" placeholder="${t("search_placeholder")}" />`;
    root.insertBefore(search, header.nextSibling);
  }
}
