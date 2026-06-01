import "./styles/base.css";
import { detectLang, setLang } from "./i18n/index.js";
import { renderCart } from "./pages/cart.js";
import { renderCheckout } from "./pages/checkout.js";
import { renderHome } from "./pages/home.js";
import { renderOrders } from "./pages/orders.js";
import { renderProduct } from "./pages/product.js";
import { registerRoute, startRouter } from "./router.js";
import { initTelegram } from "./telegram.js";

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

initTelegram();
setLang(detectLang());

registerRoute("/", () => renderHome(app));
registerRoute("/product/:id", () => renderProduct(app));
registerRoute("/cart", () => renderCart(app));
registerRoute("/checkout", () => renderCheckout(app));
registerRoute("/orders", () => renderOrders(app));

startRouter();
