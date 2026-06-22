import { t } from "../i18n/index.js";
import { ensurePageRoot } from "../shell.js";

export function renderHeader(
  root: HTMLElement,
  opts?: {
    showSearch?: boolean;
    searchInputId?: string;
    /** Подсказка и кнопка импорта по артикулу (главная). */
    unifiedSearch?: boolean;
  },
): void {
  const pageRoot = ensurePageRoot(root);
  pageRoot.querySelector(".app-header")?.remove();
  pageRoot.querySelector(".search-section")?.remove();

  const header = document.createElement("header");
  header.className = "app-header app-header--center";
  header.innerHTML = `
    <h1 class="app-header__title">${t("shop")}</h1>
  `;
  pageRoot.prepend(header);

  if (opts?.showSearch) {
    const searchSection = document.createElement("section");
    searchSection.className = "search-section";
    const inputId = opts.searchInputId ?? "search-input";
    const unified = opts.unifiedSearch ?? false;

    if (unified) {
      searchSection.innerHTML = `
        <div class="search-bar search-bar--unified">
          <span class="material-symbols-outlined search-bar__icon">search</span>
          <input
            type="search"
            id="${inputId}"
            placeholder="${t("search_placeholder")}"
            autocomplete="off"
            enterkeyhint="search"
            inputmode="search"
          />
          <button
            type="button"
            id="search-import-btn"
            class="search-bar__go-btn"
            aria-label="${t("poizon_import_button")}"
            title="${t("poizon_import_button")}"
          >
            <span class="material-symbols-outlined">travel_explore</span>
          </button>
        </div>
        <p class="search-section__hint">${t("poizon_import_hint")}</p>
        <p class="search-section__status" id="search-import-status" hidden></p>
      `;
    } else {
      searchSection.innerHTML = `
        <div class="search-bar">
          <span class="material-symbols-outlined search-bar__icon">search</span>
          <input type="search" id="${inputId}" placeholder="${t("search_placeholder")}" autocomplete="off" enterkeyhint="search" inputmode="search" />
        </div>
      `;
    }

    header.insertAdjacentElement("afterend", searchSection);
  }
}
