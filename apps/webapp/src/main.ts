import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "material-symbols/outlined.css";
import "./styles/base.css";
import { syncBottomNav } from "./components/bottom-nav.js";
import { detectLang, setLang } from "./i18n/index.js";
import { renderCart } from "./pages/cart.js";
import { renderCheckout } from "./pages/checkout.js";
import { renderHome } from "./pages/home.js";
import { renderMenu } from "./pages/menu.js";
import { renderOrders } from "./pages/orders.js";
import { renderProduct } from "./pages/product.js";
import { renderProfile } from "./pages/profile.js";
import { getCurrentPath, registerRoute, startRouter } from "./router.js";
import { ensurePageRoot } from "./shell.js";
import { initTelegram } from "./telegram.js";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");
const app: HTMLElement = appEl;

initTelegram();
setLang(detectLang());
ensurePageRoot(app);

async function dispatch(path: string, handler: () => void | Promise<void>) {
  try {
    await handler();
  } finally {
    syncBottomNav(app, getCurrentPath());
  }
}

function wrap(handler: () => void | Promise<void>) {
  return () => dispatch(getCurrentPath(), handler);
}

registerRoute("/", () => wrap(() => renderHome(app))());
registerRoute("/menu", () => wrap(() => renderMenu(app))());
registerRoute("/profile", () => wrap(() => renderProfile(app))());
registerRoute("/product/:id", () => wrap(() => renderProduct(app))());
registerRoute("/cart", () => wrap(() => renderCart(app))());
registerRoute("/checkout", () => wrap(() => renderCheckout(app))());
registerRoute("/orders", () => wrap(() => renderOrders(app))());

startRouter();
