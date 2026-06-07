const PAGE_ROOT_ID = "page-root";
const ENTERING_CLASS = "page-root--entering";

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
  const root = ensurePageRoot(app);
  root.innerHTML = "";
  app.querySelector(".app-header")?.remove();
  app.querySelector(".search-section")?.remove();
  // Trigger fade-in transition on route change
  root.classList.remove(ENTERING_CLASS);
  // Force reflow to restart animation
  void root.offsetHeight;
  root.classList.add(ENTERING_CLASS);
  root.addEventListener(
    "animationend",
    () => root.classList.remove(ENTERING_CLASS),
    { once: true },
  );
}
