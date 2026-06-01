import { apiGet } from "../api/client.js";
import { t } from "../i18n/index.js";
import { getCurrentPath, navigate } from "../router.js";

export function renderBottomNav(root: HTMLElement): void {
  root.querySelector(".bottom-nav")?.remove();
  root.classList.add("has-bottom-nav");

  const path = getCurrentPath();
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.setAttribute("aria-label", t("nav_main"));

  const items = [
    { href: "/", icon: "storefront", label: t("nav_shop"), match: (p: string) => p === "/" },
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
      href: "#lang",
      icon: "person",
      label: t("nav_profile"),
      match: () => false,
      langToggle: true,
    },
  ];

  for (const item of items) {
    const a = document.createElement("a");
    const active = !item.langToggle && item.match(path);
    a.className = `bottom-nav__item${active ? " bottom-nav__item--active" : ""}`;
    if (active) a.setAttribute("aria-current", "page");
    a.href = item.langToggle ? "#" : `#${item.href}`;
    a.innerHTML = `
      <span class="material-symbols-outlined">${item.icon}</span>
      <span>${item.label}</span>
    `;
    if (item.dot) {
      const dot = document.createElement("span");
      dot.className = "bottom-nav__dot";
      dot.hidden = true;
      dot.id = "cart-nav-dot";
      a.appendChild(dot);
    }
    if (item.langToggle) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("lang-btn")?.click();
      });
    } else {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        navigate(item.href);
      });
    }
    nav.appendChild(a);
  }

  root.appendChild(nav);

  void apiGet<{ data: unknown[] }>("/api/cart")
    .then((res) => {
      const dot = document.getElementById("cart-nav-dot");
      if (dot) dot.hidden = !res.data?.length;
    })
    .catch(() => {
      /* offline */
    });
}

export function hideBottomNav(root: HTMLElement): void {
  root.classList.remove("has-bottom-nav");
  root.querySelector(".bottom-nav")?.remove();
}

export function shouldShowBottomNav(path: string): boolean {
  return path === "/" || path === "/cart" || path === "/orders";
}
