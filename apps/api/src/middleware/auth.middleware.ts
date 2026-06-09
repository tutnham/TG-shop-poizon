import { createMiddleware } from "hono/factory";
import { upsertTelegramUser } from "../db/user.repository.js";
import { parseTelegramUser, validateInitData } from "../lib/telegram-auth.js";
import { getEnvOptional } from "../types/env.types.js";
import type { AppEnv } from "../types/env.types.js";

export const tmaAuth = createMiddleware<AppEnv>(async (c, next) => {
  const initData =
    c.req.header("X-Telegram-Init-Data") ??
    c.req.header("x-telegram-init-data");

  if (!initData) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = getEnvOptional("SHOP_BOT_TOKEN");
  if (!token || !validateInitData(initData, token)) {
    return c.json({ error: "Invalid initData" }, 403);
  }

  const user = parseTelegramUser(initData);
  if (!user) {
    return c.json({ error: "Invalid user" }, 403);
  }

  c.set("telegramUser", user);
  const userId = await upsertTelegramUser(user);
  c.set("userId", userId);
  await next();
});
