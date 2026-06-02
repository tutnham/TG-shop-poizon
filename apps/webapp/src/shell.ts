const PAGE_ROOT_ID = "page-root";

/** Контейнер страницы: нижняя навигация остаётся в #app и не перерисовывается. */
export function ensurePageRoot(app: HTMLElement): HTMLElement {
  let pageRoot = app.querySelector<HTMLElement>(`#${PAGE_ROOT_ID}`);
  if (!pageRoot) {
    pageRoot = document.createElement("div");
    pageRoot.id = PAGE_ROOT_ID;
    pageRoot.className = "page-root";
    app.prepend(pageRoot);
  }
  return pageRoot;
}

export function clearPageRoot(app: HTMLElement): void {
  ensurePageRoot(app).innerHTML = "";
  app.querySelector(".app-header")?.remove();
  app.querySelector(".search-section")?.remove();
}
