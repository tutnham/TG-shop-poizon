import { Hono } from "hono";
import { handleAdminUpdate } from "../bots/admin.bot.js";
import { handleShopUpdate } from "../bots/shop.bot.js";
import {
  webhookRateLimit,
  webhookSecret,
} from "../middleware/webhook.middleware.js";

const webhooks = new Hono();
webhooks.use("*", webhookRateLimit);
webhooks.use("*", webhookSecret);

webhooks.post("/shop", async (c) => {
  const update = await c.req.json();
  await handleShopUpdate(update);
  return c.json({ ok: true });
});

webhooks.post("/admin", async (c) => {
  const update = await c.req.json();
  await handleAdminUpdate(update);
  return c.json({ ok: true });
});

export { webhooks };
