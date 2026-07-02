import { zValidator } from "@hono/zod-validator";
import type { OrderListItem, OrderStatus } from "@poizon-shop/shared";
import { Hono } from "hono";
import { z } from "zod";
import { getSupabase } from "../db/client.js";
import { getConfigValue, setConfigValue } from "../db/config.repository.js";
import * as orderRepo from "../db/order.repository.js";
import * as productRepo from "../db/product.repository.js";
import { adminAuth } from "../middleware/admin-auth.middleware.js";
import { refreshRates } from "../services/currency.service.js";
import * as orderService from "../services/order.service.js";
import { runFullSync } from "../services/poizon-sync.service.js";
import {
  loadShopPricingSettings,
  setMarkup,
} from "../services/pricing.service.js";
import type { AppEnv } from "../types/env.types.js";

const admin = new Hono<AppEnv>();
admin.use("*", adminAuth);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
admin.get("/dashboard", async (c) => {
  const stats = await orderRepo.getOrderStats();
  return c.json({
    data: {
      orders_today: stats.today,
      orders_week: stats.week,
      revenue_today_rub: stats.revenue_today,
    },
  });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const AdminOrdersQuerySchema = z.object({
  status: z
    .enum([
      "pending",
      "confirmed",
      "paid",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

admin.get("/orders", zValidator("query", AdminOrdersQuerySchema), async (c) => {
  const q = c.req.valid("query");
  const { orders, total } = await orderRepo.listOrdersAdmin({
    status: q.status,
    page: q.page,
    limit: q.limit,
  });
  return c.json({
    data: orders,
    pagination: { page: q.page, limit: q.limit, total },
  });
});

admin.get("/orders/:id", async (c) => {
  const order = await orderRepo.getOrderById(c.req.param("id"));
  if (!order) return c.json({ error: "Not found" }, 404);
  return c.json({ data: order });
});

const UpdateOrderStatusSchema = z.object({
  status: z.enum([
    "confirmed",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ]),
  tracking_number: z.string().max(100).optional(),
  admin_comment: z.string().max(500).optional(),
});

admin.patch(
  "/orders/:id/status",
  zValidator("json", UpdateOrderStatusSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const extra: { tracking_number?: string; admin_comment?: string } = {};
    if (body.tracking_number) extra.tracking_number = body.tracking_number;
    if (body.admin_comment) extra.admin_comment = body.admin_comment;

    const applyResult = await orderService.applyOrderStatusChange({
      orderId: id,
      status: body.status,
      adminTelegramId: 0,
      tracking: body.tracking_number,
      adminComment: body.admin_comment,
    });

    if (!applyResult.ok) {
      const statusCode = applyResult.error === "Order not found" ? 404 : 400;
      return c.json({ error: applyResult.error }, statusCode);
    }

    return c.json({
      ok: true,
      status: body.status,
      notify_sent: applyResult.notifySent,
    });
  },
);

const UpdateTrackingSchema = z.object({
  tracking_number: z.string().min(1).max(100),
});

admin.patch(
  "/orders/:id/tracking",
  zValidator("json", UpdateTrackingSchema),
  async (c) => {
    const id = c.req.param("id");
    const { tracking_number } = c.req.valid("json");
    // Get current order status to preserve it
    const order = await orderRepo.getOrderById(id);
    if (!order) return c.json({ error: "Not found" }, 404);
    await orderRepo.updateOrderStatus(id, order.status, {
      tracking_number,
    });
    return c.json({ ok: true });
  },
);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
admin.get("/products", async (c) => {
  const { items, total } = await productRepo.listProducts({
    page: 1,
    limit: 100,
    sort: "new",
  });
  return c.json({ data: items, total });
});

const VisibilitySchema = z.object({
  is_available: z.boolean(),
});

admin.patch(
  "/products/:id/visibility",
  zValidator("json", VisibilitySchema),
  async (c) => {
    await productRepo.setProductVisibility(
      c.req.param("id"),
      c.req.valid("json").is_available,
    );
    return c.json({ ok: true });
  },
);

admin.post("/products/sync", async (c) => {
  const result = await runFullSync();
  return c.json(
    result.ok
      ? { ok: true, items_synced: result.items_synced }
      : { error: result.error },
    result.ok ? 200 : 400,
  );
});

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
admin.get("/pricing", async (c) => {
  const rates = await refreshRates();
  const cfg = await loadShopPricingSettings();
  return c.json({
    data: {
      markup_percent: cfg.markup_percent,
      delivery_fee: cfg.delivery_fee,
      cny_rub: rates.cny_rub,
      usdt_rub: rates.usdt_rub,
      cny_per_usdt: rates.cny_per_usdt,
      fetched_at: rates.fetched_at,
      sources: rates.sources,
    },
  });
});

const UpdatePricingSchema = z.object({
  markup_percent: z.number().min(0).max(1000).optional(),
  delivery_fee: z.number().min(0).optional(),
});

admin.patch("/pricing", zValidator("json", UpdatePricingSchema), async (c) => {
  const body = c.req.valid("json");
  if (body.markup_percent != null) {
    await setMarkup(body.markup_percent, body.delivery_fee);
  }
  const rates = await refreshRates(true);
  const cfg = await loadShopPricingSettings();
  return c.json({
    data: {
      markup_percent: cfg.markup_percent,
      delivery_fee: cfg.delivery_fee,
      cny_rub: rates.cny_rub,
      fetched_at: rates.fetched_at,
    },
  });
});

// ---------------------------------------------------------------------------
// Sync logs
// ---------------------------------------------------------------------------
admin.get("/sync-logs", async (c) => {
  const { data, error } = await getSupabase()
    .from("sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
admin.get("/config", async (c) => {
  const { data, error } = await getSupabase()
    .from("shop_config")
    .select("key, value");
  if (error) return c.json({ error: error.message }, 500);
  const cfg: Record<string, unknown> = {};
  for (const row of data ?? []) {
    cfg[row.key as string] = row.value;
  }
  return c.json({ data: cfg });
});

const PROTECTED_CONFIG_KEYS = new Set(["admin_telegram_ids"]);

const UpdateConfigSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.unknown()),
    z.record(z.unknown()),
  ]),
});

admin.patch("/config", zValidator("json", UpdateConfigSchema), async (c) => {
  const { key, value } = c.req.valid("json");
  if (PROTECTED_CONFIG_KEYS.has(key)) {
    return c.json({ error: "Cannot modify protected config key" }, 403);
  }
  await setConfigValue(key, value);
  return c.json({ ok: true });
});

export { admin };
