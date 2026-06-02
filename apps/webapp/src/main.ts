import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "material-symbols/outlined.css";
import "./styles/base.css";
import {
  initBottomNavShell,
  shouldShowBottomNav,
  syncBottomNav,
} from "./components/bottom-nav.js";
import { detectLang, setLang } from "./i18n/index.js";
import { initDemoCart } from "./lib/demo-cart.js";
import { bindKeyboardDismiss } from "./lib/keyboard.js";
import { isCurrentNavigation } from "./lib/navigation-guard.js";
import { renderCart } from "./pages/cart.js";
import { renderCheckout } from "./pages/checkout.js";
import { renderHome } from "./pages/home.js";
import { renderMenu } from "./pages/menu.js";
import { renderOrders } from "./pages/orders.js";
import { renderProduct } from "./pages/product.js";
import { renderProfile } from "./pages/profile.js";
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
setLang(detectLang());
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

registerRoute("/", () => wrap(() => renderHome(app))());
registerRoute("/menu", () => wrap(() => renderMenu(app))());
registerRoute("/profile", () => wrap(() => renderProfile(app))());
registerRoute("/product/:id", () => wrap(() => renderProduct(app))());
registerRoute("/cart", () => wrap(() => renderCart(app))());
registerRoute("/checkout", () => wrap(() => renderCheckout(app))());
registerRoute("/orders", () => wrap(() => renderOrders(app))());

startRouter();
