import { apiPatch } from "../api/client.js";
import { type Lang, getLang, setLang, t } from "../i18n/index.js";
import { navigate } from "../router.js";

export function renderHeader(
  root: HTMLElement,
  opts?: { showSearch?: boolean; searchInputId?: string },
): void {
  root.querySelector(".app-header")?.remove();
  root.querySelector(".search-section")?.remove();

  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <button type="button" class="header-icon-btn" id="menu-btn" aria-label="${t("menu")}">
      <span class="material-symbols-outlined">menu</span>
    </button>
    <h1 class="app-header__title">${t("shop")}</h1>
    <button type="button" class="header-icon-btn" id="header-search-btn" aria-label="${t("search")}">
      <span class="material-symbols-outlined">search</span>
    </button>
    <button type="button" class="header-icon-btn" id="lang-btn" hidden aria-label="${t("lang")}">
      ${t("lang")}
    </button>
  `;
  root.prepend(header);

  header.querySelector("#menu-btn")?.addEventListener("click", () => {
    navigate("/orders");
  });

  header.querySelector("#header-search-btn")?.addEventListener("click", () => {
    const input = document.getElementById(
      opts?.searchInputId ?? "search-input",
    ) as HTMLInputElement | null;
    input?.focus();
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

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
    const searchSection = document.createElement("section");
    searchSection.className = "search-section";
    const inputId = opts.searchInputId ?? "search-input";
    searchSection.innerHTML = `
      <div class="search-bar">
        <span class="material-symbols-outlined search-bar__icon">search</span>
        <input type="search" id="${inputId}" placeholder="${t("search_placeholder")}" autocomplete="off" />
      </div>
    `;
    header.insertAdjacentElement("afterend", searchSection);
  }
}
