import { apiGet } from "../api/client.js";
import { t } from "../i18n/index.js";
import { getCurrentPath, navigate } from "../router.js";
import { ensurePageRoot } from "../shell.js";

const NAV_PATHS = ["/", "/orders", "/cart", "/profile", "/menu"] as const;

export function shouldShowBottomNav(path: string): boolean {
  return (NAV_PATHS as readonly string[]).includes(path);
}

function isActive(
  path: string,
  item: { href: string; match: (p: string) => boolean },
): boolean {
  return item.match(path);
}

function buildNavItems(path: string): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.setAttribute("aria-label", t("nav_main"));

  const items = [
    {
      href: "/",
      icon: "storefront",
      label: t("nav_shop"),
      match: (p: string) => p === "/",
    },
    {
      href: "/orders",
      icon: "receipt_long",
      label: t("nav_orders"),
      match: (p: string) => p === "/orders" || p.startsWith("/orders/"),
    },
    {
      href: "/cart",
      icon: "shopping_cart",
      label: t("nav_cart"),
      match: (p: string) => p === "/cart",
      dot: true,
    },
    {
      href: "/profile",
      icon: "person",
      label: t("nav_profile"),
      match: (p: string) => p === "/profile",
    },
  ];

  for (const item of items) {
    const a = document.createElement("a");
    const active = isActive(path, item);
    a.className = `bottom-nav__item${active ? " bottom-nav__item--active" : ""}`;
    if (active) a.setAttribute("aria-current", "page");
    a.href = `#${item.href}`;
    a.innerHTML = `
      <span class="material-symbols-outlined">${item.icon}</span>
      <span>${item.label}</span>
    `;
    if ("dot" in item && item.dot) {
      const dot = document.createElement("span");
      dot.className = "bottom-nav__dot";
      dot.hidden = true;
      dot.id = "cart-nav-dot";
      a.appendChild(dot);
    }
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(item.href);
    });
    nav.appendChild(a);
  }

  return nav;
}

function updateActiveState(nav: HTMLElement, path: string): void {
  const links = nav.querySelectorAll<HTMLAnchorElement>(".bottom-nav__item");
  const hrefs = ["/", "/orders", "/cart", "/profile"];
  const matchers = [
    (p: string) => p === "/",
    (p: string) => p === "/orders" || p.startsWith("/orders/"),
    (p: string) => p === "/cart",
    (p: string) => p === "/profile",
  ];
  links.forEach((a, i) => {
    const active = matchers[i]?.(path) ?? false;
    a.classList.toggle("bottom-nav__item--active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function refreshCartDot(): void {
  void apiGet<{ data: unknown[] }>("/api/cart")
    .then((res) => {
      const dot = document.getElementById("cart-nav-dot");
      if (dot) dot.hidden = !res.data?.length;
    })
    .catch(() => {
      /* offline */
    });
}

/** Показать или обновить нижнюю навигацию без пересоздания DOM. */
export function syncBottomNav(app: HTMLElement, path: string): void {
  if (!shouldShowBottomNav(path)) {
    hideBottomNav(app);
    return;
  }

  app.classList.add("has-bottom-nav");
  ensurePageRoot(app);
  let nav = app.querySelector<HTMLElement>(".bottom-nav");
  if (!nav) {
    nav = buildNavItems(path);
    app.appendChild(nav);
    refreshCartDot();
  } else {
    updateActiveState(nav, path);
    app.appendChild(nav);
  }
}

export function renderBottomNav(app: HTMLElement): void {
  syncBottomNav(app, getCurrentPath());
}

export function hideBottomNav(app: HTMLElement): void {
  app.classList.remove("has-bottom-nav");
  app.querySelector(".bottom-nav")?.remove();
}
