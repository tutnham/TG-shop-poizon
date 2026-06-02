import { DEMO_PRODUCTS } from "../data/demo-products.js";
import { t } from "../i18n/index.js";
import { renderProductCard } from "./product-card.js";

/** Блок «как выглядит карточка» на главной. */
export function renderCatalogPreview(): HTMLElement {
  const section = document.createElement("section");
  section.className = "catalog-preview";
  section.id = "catalog-preview";

  section.innerHTML = `
    <div class="section-head catalog-preview__head">
      <h2>${t("catalog_preview_title")}</h2>
      <p class="catalog-preview__hint">${t("catalog_preview_hint")}</p>
    </div>
  `;

  const grid = document.createElement("div");
  grid.className = "grid-products";

  DEMO_PRODUCTS.forEach((p, i) => {
    const badge =
      i === 0
        ? { text: "Top 1", variant: "top" as const }
        : { text: "New", variant: "new" as const };
    grid.appendChild(renderProductCard(p, { badge, demo: true }));
  });

  section.appendChild(grid);
  return section;
}

export function setCatalogPreviewVisible(visible: boolean): void {
  const el = document.getElementById("catalog-preview");
  if (el) el.hidden = !visible;
}
