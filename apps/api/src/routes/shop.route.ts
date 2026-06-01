import { zValidator } from "@hono/zod-validator";
import {
  AddToCartSchema,
  CreateOrderSchema,
  ProductsQuerySchema,
  UpdateCartItemSchema,
  UpdateLanguageSchema,
} from "@poizon-shop/shared";
import { Hono } from "hono";
import * as cartRepo from "../db/cart.repository.js";
import { getConfigValue, getConfigValues } from "../db/config.repository.js";
import * as orderRepo from "../db/order.repository.js";
import * as productRepo from "../db/product.repository.js";
import { getLastSyncTime } from "../db/product.repository.js";
import { updateUserLanguage } from "../db/user.repository.js";
import { tmaAuth } from "../middleware/auth.middleware.js";
import {
  buildTonTransferLink,
  createOrderFromCart,
} from "../services/order.service.js";
import type { AppEnv } from "../types/env.types.js";

const shop = new Hono<AppEnv>();
shop.use("*", tmaAuth);

shop.get("/config", async (c) => {
  const cfg = await getConfigValues([
    "shop_name",
    "welcome_message",
    "markup_disclaimer_ru",
    "markup_disclaimer_en",
    "hide_demo_products",
  ]);
  const last_synced_at = await getLastSyncTime();
  const str = (v: unknown, fallback: string) => {
    const s = typeof v === "string" ? v : fallback;
    return s.replace(/^"|"$/g, "");
  };
  return c.json({
    shop_name: str(cfg.shop_name, "Poizon Shop"),
    welcome_message: str(cfg.welcome_message, "Welcome"),
    markup_disclaimer_ru: str(cfg.markup_disclaimer_ru, ""),
    markup_disclaimer_en: str(cfg.markup_disclaimer_en, ""),
    last_synced_at,
    hide_demo_products: cfg.hide_demo_products === true,
  });
});

shop.get("/products", zValidator("query", ProductsQuerySchema), async (c) => {
  const q = c.req.valid("query");
  const { items, total } = await productRepo.listProducts(q);
  return c.json({
    data: items,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      pages: Math.ceil(total / q.limit) || 1,
    },
  });
});

shop.get("/products/:id", async (c) => {
  const product = await productRepo.getProductById(c.req.param("id"));
  if (!product) return c.json({ error: "Not found" }, 404);
  return c.json({ data: product });
});

shop.get("/categories", async (c) => {
  const categories = await productRepo.listCategories();
  return c.json({ data: categories });
});

shop.get("/cart", async (c) => {
  const userId = c.get("userId");
  const items = await cartRepo.getCartItems(userId);
  const mapped = items.map((item) => ({
    id: item.id,
    product_id: item.product_id,
    size: item.size,
    quantity: item.quantity,
    product: {
      id: item.product.id,
      name: item.product.name_ru ?? item.product.name,
      brand: item.product.brand,
      image_url: item.product.image_urls?.[0] ?? null,
      price_rub: Number(item.product.price_rub),
      price_usdt: Number(item.product.price_usdt),
    },
    line_rub: Number(item.product.price_rub) * item.quantity,
    line_usdt: Number(item.product.price_usdt) * item.quantity,
  }));
  const total_rub = mapped.reduce((s, i) => s + i.line_rub, 0);
  const total_usdt = mapped.reduce((s, i) => s + i.line_usdt, 0);
  return c.json({ data: mapped, total_rub, total_usdt });
});

shop.post("/cart", zValidator("json", AddToCartSchema), async (c) => {
  const body = c.req.valid("json");
  const product = await productRepo.getProductById(body.product_id);
  if (!product) return c.json({ error: "Product not found" }, 404);
  const stock = product.stock ?? {};
  if (stock[body.size] === false) {
    return c.json({ error: "Size unavailable" }, 400);
  }
  await cartRepo.addCartItem(
    c.get("userId"),
    body.product_id,
    body.size,
    body.quantity,
  );
  return c.json({ ok: true });
});

shop.patch(
  "/cart/:itemId",
  zValidator("json", UpdateCartItemSchema),
  async (c) => {
    await cartRepo.updateCartItem(
      c.req.param("itemId"),
      c.get("userId"),
      c.req.valid("json"),
    );
    return c.json({ ok: true });
  },
);

shop.delete("/cart/:itemId", async (c) => {
  await cartRepo.deleteCartItem(c.req.param("itemId"), c.get("userId"));
  return c.json({ ok: true });
});

shop.post("/orders", zValidator("json", CreateOrderSchema), async (c) => {
  const result = await createOrderFromCart(
    c.get("userId"),
    c.req.valid("json"),
  );
  if (!result.ok)
    return c.json({ error: result.error.message }, result.error.status as 400);

  let ton_link: string | undefined;
  if (c.req.valid("json").payment_method === "ton") {
    const addr = await getConfigValue<string>("ton_wallet_address", "");
    const tonAmount = result.data.payment.ton_amount ?? 0;
    ton_link = buildTonTransferLink(
      typeof addr === "string" ? addr.replace(/^"|"$/g, "") : "",
      tonAmount,
      result.data.payment.wallet_comment ?? "",
    );
  }

  return c.json({
    data: {
      ...result.data,
      ton_link,
    },
  });
});

shop.get("/orders", async (c) => {
  const orders = await orderRepo.listOrdersByUser(c.get("userId"));
  return c.json({ data: orders });
});

shop.get("/orders/:id", async (c) => {
  const order = await orderRepo.getOrderById(
    c.req.param("id"),
    c.get("userId"),
  );
  if (!order) return c.json({ error: "Not found" }, 404);
  return c.json({ data: order });
});

shop.patch(
  "/user/language",
  zValidator("json", UpdateLanguageSchema),
  async (c) => {
    await updateUserLanguage(
      c.get("userId"),
      c.req.valid("json").language_code,
    );
    return c.json({ ok: true });
  },
);

export { shop };
