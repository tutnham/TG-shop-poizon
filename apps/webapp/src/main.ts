import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "material-symbols/outlined.css";
import "./styles/base.css";
import {
  hideBottomNav,
  renderBottomNav,
  shouldShowBottomNav,
} from "./components/bottom-nav.js";
import { detectLang, setLang } from "./i18n/index.js";
import { renderCart } from "./pages/cart.js";
import { renderCheckout } from "./pages/checkout.js";
import { renderHome } from "./pages/home.js";
import { renderOrders } from "./pages/orders.js";
import { renderProduct } from "./pages/product.js";
import { getCurrentPath, registerRoute, startRouter } from "./router.js";
import { initTelegram } from "./telegram.js";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");
const app: HTMLElement = appEl;

initTelegram();
setLang(detectLang());

async function dispatch(path: string, handler: () => void | Promise<void>) {
  app.classList.remove("page-with-nav", "has-bottom-nav");
  hideBottomNav(app);
  await handler();
  if (shouldShowBottomNav(path)) {
    renderBottomNav(app);
  }
}

function wrap(handler: () => void | Promise<void>) {
  return () => dispatch(getCurrentPath(), handler);
}

registerRoute("/", () => wrap(() => renderHome(app))());
registerRoute("/product/:id", () => wrap(() => renderProduct(app))());
registerRoute("/cart", () => wrap(() => renderCart(app))());
registerRoute("/checkout", () => wrap(() => renderCheckout(app))());
registerRoute("/orders", () => wrap(() => renderOrders(app))());

startRouter();
