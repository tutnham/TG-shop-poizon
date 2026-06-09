import { t } from "../i18n/index.js";
import { ensurePageRoot } from "../shell.js";

export function renderHeader(
  root: HTMLElement,
  opts?: { showSearch?: boolean; searchInputId?: string },
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
    searchSection.innerHTML = `
      <div class="search-bar">
        <span class="material-symbols-outlined search-bar__icon">search</span>
        <input type="search" id="${inputId}" placeholder="${t("search_placeholder")}" autocomplete="off" enterkeyhint="search" inputmode="search" />
      </div>
    `;
    header.insertAdjacentElement("afterend", searchSection);
  }
}
