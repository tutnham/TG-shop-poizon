import { createMiddleware } from "hono/factory";
import { getAdminTelegramIds } from "../db/config.repository.js";
import { parseTelegramUser, validateInitData } from "../lib/telegram-auth.js";
import { getEnvOptional } from "../types/env.types.js";
import type { AppEnv } from "../types/env.types.js";

/**
 * Middleware для защиты Admin REST API.
 * Проверяет валидность Telegram initData и наличие Telegram ID в списке админов.
 */
export const adminAuth = createMiddleware<AppEnv>(async (c, next) => {
  const initData =
    c.req.header("X-Telegram-Init-Data") ??
    c.req.header("x-telegram-init-data");

  if (!initData) {
    return c.json({ error: "Unauthorized — missing initData" }, 401);
  }

  // Используем ADMIN_BOT_TOKEN для проверки подписи initData.
  // Fallback на SHOP_BOT_TOKEN допустим только вне production.
  const adminToken = getEnvOptional("ADMIN_BOT_TOKEN");
  if (!adminToken && process.env.NODE_ENV === "production") {
    return c.json({ error: "Admin bot token not configured" }, 500);
  }
  const token = adminToken || getEnvOptional("SHOP_BOT_TOKEN");
  if (!token || !validateInitData(initData, token)) {
    return c.json({ error: "Invalid initData signature" }, 403);
  }

  const user = parseTelegramUser(initData);
  if (!user) {
    return c.json({ error: "Invalid user in initData" }, 403);
  }

  const adminIds = await getAdminTelegramIds();
  if (!adminIds.includes(user.id)) {
    return c.json({ error: "Forbidden — not an admin" }, 403);
  }

  c.set("telegramUser", user);
  await next();
});
