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
import { getSupabase, isSupabaseConfigured } from "../db/client.js";
import { getConfigValue, getConfigValues } from "../db/config.repository.js";
import * as orderRepo from "../db/order.repository.js";
import * as productRepo from "../db/product.repository.js";
import { getLastSyncTime } from "../db/product.repository.js";
import { getUserById, updateUserLanguage } from "../db/user.repository.js";
import { optionalTmaAuth, requireTmaAuth } from "../middleware/auth.middleware.js";
import { mutationRateLimit } from "../middleware/mutation-rate-limit.js";
import { bodySizeLimit } from "../middleware/request-body-limit.js";
import { getExchangeRates } from "../services/currency.service.js";
import { notifyCartUpdate } from "../services/notification.service.js";
import {
  buildTonTransferLink,
  createOrderFromCart,
} from "../services/order.service.js";
import { resolveProductSizePrice } from "../services/product-pricing.js";
import type { AppEnv } from "../types/env.types.js";

const shop = new Hono<AppEnv>();

shop.get("/ping", optionalTmaAuth, async (c) => {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("shop_config").select("key").limit(1);
    return c.json({
      ok: !error,
      authenticated: Boolean(c.get("userId")),
      userId: c.get("userId") ?? null,
      sb_configured: isSupabaseConfigured(),
    });
  } catch {
    return c.json({
      ok: false,
      authenticated: Boolean(c.get("userId")),
      userId: c.get("userId") ?? null,
      sb_configured: isSupabaseConfigured(),
    });
  }
});
// Вспомогательная функция: отправляет уведомление о корзине fire-and-forget
async function fireCartNotification(userId: string): Promise<void> {
  try {
    const [cart, user] = await Promise.all([
      cartRepo.getCartItems(userId),
      getUserById(userId),
    ]);
    if (!user?.telegram_id) return;
    const items = cart.map((item) => {
      const unit = resolveProductSizePrice(item.product, item.size);
      return {
        name: item.product.name_ru ?? item.product.name,
        brand: item.product.brand,
        size: item.size,
        quantity: item.quantity,
        price_rub: unit.rub * item.quantity,
      };
    });
    const totalRub = items.reduce((s, i) => s + i.price_rub, 0);
    const totalUsdt = cart.reduce((s, i) => {
      const unit = resolveProductSizePrice(i.product, i.size);
      return s + unit.usdt * i.quantity;
    }, 0);
    await notifyCartUpdate(user.telegram_id, items, totalRub, totalUsdt);
  } catch (err) {
    console.error("[cart-notify] failed", err);
  }
}

shop.get("/config", async (c) => {
  const cfg = await getConfigValues([
    "shop_name",
    "welcome_message",
    "markup_disclaimer_ru",
    "markup_disclaimer_en",
  ]);
  const last_synced_at = await getLastSyncTime();
  const rates_updated_at = await getConfigValue<string | null>(
    "rates_updated_at",
    null,
  );
  // shop_config.value is JSONB; values come back already typed (string/number/bool).
  const asString = (v: unknown, fallback: string): string =>
    typeof v === "string" ? v : fallback;
  return c.json({
    shop_name: asString(cfg.shop_name, "Poizon Shop"),
    welcome_message: asString(cfg.welcome_message, "Welcome"),
    markup_disclaimer_ru: asString(cfg.markup_disclaimer_ru, ""),
    markup_disclaimer_en: asString(cfg.markup_disclaimer_en, ""),
    last_synced_at,
    rates_updated_at:
      typeof rates_updated_at === "string" ? rates_updated_at : null,
  });
});

shop.get("/rates", async (c) => {
  const rates = await getExchangeRates();
  return c.json({
    data: {
      cny_rub: rates.cny_rub,
      usdt_rub: rates.usdt_rub,
      cny_per_usdt: rates.cny_per_usdt,
      updated_at: rates.fetched_at,
      sources: rates.sources,
    },
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

shop.get("/brands", async (c) => {
  const brands = await productRepo.listBrands();
  return c.json({ data: brands });
});

shop.use("/cart", requireTmaAuth);
shop.use("/cart/*", requireTmaAuth);
shop.use("/orders", requireTmaAuth);
shop.use("/orders/*", requireTmaAuth);
shop.use("/user/*", requireTmaAuth);

shop.get("/cart", async (c) => {
  const userId = c.get("userId") as string;
  const items = await cartRepo.getCartItems(userId);
  const mapped = items.map((item) => {
    const unit = resolveProductSizePrice(item.product, item.size);
    return {
      id: item.id,
      product_id: item.product_id,
      size: item.size,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        name: item.product.name_ru ?? item.product.name,
        brand: item.product.brand,
        image_url: item.product.image_urls?.[0] ?? null,
        price_rub: unit.rub,
        price_usdt: unit.usdt,
      },
      line_rub: unit.rub * item.quantity,
      line_usdt: unit.usdt * item.quantity,
    };
  });
  const total_rub = mapped.reduce((s, i) => s + i.line_rub, 0);
  const total_usdt = mapped.reduce((s, i) => s + i.line_usdt, 0);
  return c.json({ data: mapped, total_rub, total_usdt });
});

shop.post(
  "/cart",
  mutationRateLimit,
  bodySizeLimit(),
  zValidator("json", AddToCartSchema),
  async (c) => {
  const body = c.req.valid("json");
  const product = await productRepo.getProductById(body.product_id);
  if (!product) return c.json({ error: "Product not found" }, 404);
  const stock = product.stock ?? {};
  if (stock[body.size] === false) {
    return c.json({ error: "Size unavailable" }, 400);
  }
  const sizePrice = product.size_prices?.[body.size];
  if (
    product.size_prices &&
    Object.keys(product.size_prices).length > 0 &&
    !sizePrice
  ) {
    return c.json({ error: "Size unavailable" }, 400);
  }
  const userId = c.get("userId") as string;
  await cartRepo.addCartItem(userId, body.product_id, body.size, body.quantity);
  fireCartNotification(userId).catch((e) =>
    console.error("[cart-notify] POST /cart failed:", e),
  );
  return c.json({ ok: true });
  },
);

shop.patch(
  "/cart/:itemId",
  zValidator("json", UpdateCartItemSchema),
  async (c) => {
    const userId = c.get("userId") as string;
    await cartRepo.updateCartItem(
      c.req.param("itemId"),
      userId,
      c.req.valid("json"),
    );
    fireCartNotification(userId).catch((e) =>
      console.error("[cart-notify] PATCH /cart failed:", e),
    );
    return c.json({ ok: true });
  },
);

shop.delete("/cart/:itemId", async (c) => {
  const userId = c.get("userId") as string;
  await cartRepo.deleteCartItem(c.req.param("itemId"), userId);
  fireCartNotification(userId).catch((e) =>
    console.error("[cart-notify] DELETE /cart failed:", e),
  );
  return c.json({ ok: true });
});

shop.post(
  "/orders",
  mutationRateLimit,
  bodySizeLimit(),
  zValidator("json", CreateOrderSchema),
  async (c) => {
  const body = c.req.valid("json");
  const result = await createOrderFromCart(c.get("userId") as string, body);

  if (result.ok) {
    let ton_link: string | undefined;
    if (body.payment_method === "ton") {
      const addr = await getConfigValue<string>("ton_wallet_address", "");
      const tonAmount = result.data.payment.ton_amount ?? 0;
      ton_link = buildTonTransferLink(
        typeof addr === "string" ? addr : "",
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
  }

  const { message, status = 400 } = (
    result as { error: { message: string; code?: string; status?: number } }
  ).error;
  return c.json({ error: message }, status as 400 | 404 | 500);
  },
);

shop.get("/orders", async (c) => {
  const orders = await orderRepo.listOrdersByUser(c.get("userId") as string);
  return c.json({ data: orders });
});

shop.get("/orders/:id", async (c) => {
  const order = await orderRepo.getOrderById(
    c.req.param("id"),
    c.get("userId") as string,
  );
  if (!order) return c.json({ error: "Not found" }, 404);
  return c.json({ data: order });
});

shop.patch(
  "/user/language",
  zValidator("json", UpdateLanguageSchema),
  async (c) => {
    await updateUserLanguage(
      c.get("userId") as string,
      c.req.valid("json").language_code,
    );
    return c.json({ ok: true });
  },
);

export { shop };
