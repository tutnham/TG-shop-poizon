import { apiGet } from "../api/client.js";
import { renderHeader } from "../components/header.js";
import { t } from "../i18n/index.js";
import { navigate } from "../router.js";
import { clearPageRoot, ensurePageRoot } from "../shell.js";
import { hideBackButton, hideMainButton } from "../telegram.js";

export async function renderMenu(app: HTMLElement): Promise<void> {
  hideMainButton();
  hideBackButton();

  clearPageRoot(app);
  app.classList.add("page-with-nav");
  const pageRoot = ensurePageRoot(app);

  renderHeader(app);

  const main = document.createElement("main");
  main.className = "page page-tg-content page-tg-content--below-header";
  main.innerHTML = `
    <h2 class="section-title">${t("categories")}</h2>
    <div id="menu-categories" class="menu-categories"></div>
  `;
  pageRoot.appendChild(main);

  const list = main.querySelector("#menu-categories") as HTMLElement;

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "menu-category-card";
  allBtn.innerHTML = `
    <span class="material-symbols-outlined">grid_view</span>
    <span>${t("chip_all")}</span>
  `;
  allBtn.addEventListener("click", () => navigate("/"));
  list.appendChild(allBtn);

  try {
    const { data: cats } = await apiGet<{
      data: { slug: string; name_ru: string; name_en?: string }[];
    }>("/api/categories");

    for (const c of cats) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menu-category-card";
      btn.innerHTML = `
        <span class="material-symbols-outlined">category</span>
        <span>${c.name_ru}</span>
      `;
      btn.addEventListener("click", () => {
        sessionStorage.setItem("poizon_pending_category", c.slug);
        navigate("/");
      });
      list.appendChild(btn);
    }
  } catch {
    list.innerHTML += `<div class="empty-state">${t("error")}</div>`;
  }
}
