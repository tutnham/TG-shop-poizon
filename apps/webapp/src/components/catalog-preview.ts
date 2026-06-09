import { t } from "../i18n/index.js";

/** Блок-заглушка когда каталог пуст. */
export function renderCatalogPreview(): HTMLElement {
  const section = document.createElement("section");
  section.className = "catalog-preview";
  section.id = "catalog-preview";
  section.hidden = true;

  section.innerHTML = `
    <div class="section-head catalog-preview__head">
      <h2>${t("catalog_preview_title")}</h2>
      <p class="catalog-preview__hint">${t("catalog_preview_hint")}</p>
    </div>
  `;

  return section;
}

export function setCatalogPreviewVisible(visible: boolean): void {
  const el = document.getElementById("catalog-preview");
  if (el) el.hidden = !visible;
}
