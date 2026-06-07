import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "material-symbols";
import "./styles/base.css";
import {
  initBottomNavShell,
  shouldShowBottomNav,
  syncBottomNav,
} from "./components/bottom-nav.js";
import { initDemoCart } from "./lib/demo-cart.js";
import { bindKeyboardDismiss } from "./lib/keyboard.js";
import { isCurrentNavigation } from "./lib/navigation-guard.js";
import {
  getCurrentPath,
  getNavigationGeneration,
  registerRoute,
  startRouter,
} from "./router.js";
import { ensurePageRoot } from "./shell.js";
import { initTelegram } from "./telegram.js";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");
const app: HTMLElement = appEl;

initTelegram();
initDemoCart();
ensurePageRoot(app);
initBottomNavShell(app);
bindKeyboardDismiss(app);

async function dispatch(
  generation: number,
  handler: () => void | Promise<void>,
): Promise<void> {
  const path = getCurrentPath();
  if (shouldShowBottomNav(path)) {
    syncBottomNav(app, path);
  }

  try {
    await handler();
  } catch (err) {
    if (isCurrentNavigation(generation)) {
      syncBottomNav(app, getCurrentPath());
    }
    throw err;
  }
  if (isCurrentNavigation(generation)) {
    syncBottomNav(app, getCurrentPath());
  }
}

function wrap(handler: () => void | Promise<void>) {
  return () => {
    const generation = getNavigationGeneration();
    return dispatch(generation, handler);
  };
}

registerRoute("/", () =>
  wrap(async () => {
    const { renderHome } = await import("./pages/home.js");
    return renderHome(app);
  })(),
);
registerRoute("/menu", () =>
  wrap(async () => {
    const { renderMenu } = await import("./pages/menu.js");
    return renderMenu(app);
  })(),
);
registerRoute("/profile", () =>
  wrap(async () => {
    const { renderProfile } = await import("./pages/profile.js");
    return renderProfile(app);
  })(),
);
registerRoute("/product/:id", () =>
  wrap(async () => {
    const { renderProduct } = await import("./pages/product.js");
    return renderProduct(app);
  })(),
);
registerRoute("/cart", () =>
  wrap(async () => {
    const { renderCart } = await import("./pages/cart.js");
    return renderCart(app);
  })(),
);
registerRoute("/checkout", () =>
  wrap(async () => {
    const { renderCheckout } = await import("./pages/checkout.js");
    return renderCheckout(app);
  })(),
);
registerRoute("/orders", () =>
  wrap(async () => {
    const { renderOrders } = await import("./pages/orders.js");
    return renderOrders(app);
  })(),
);

startRouter();
