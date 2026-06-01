import { createMiddleware } from "hono/factory";
import { upsertTelegramUser } from "../db/user.repository.js";
import { parseTelegramUser, validateInitData } from "../lib/telegram-auth.js";
import {
  getEnvOptional,
  isDemoMode,
  isProduction,
} from "../types/env.types.js";
import type { AppEnv } from "../types/env.types.js";

export const tmaAuth = createMiddleware<AppEnv>(async (c, next) => {
  const initData =
    c.req.header("X-Telegram-Init-Data") ??
    c.req.header("x-telegram-init-data");

  if (isDemoMode() && !isProduction() && !initData) {
    const demoUser = { id: 999999, first_name: "Demo", language_code: "ru" };
    c.set("telegramUser", demoUser);
    try {
      const userId = await upsertTelegramUser(demoUser);
      c.set("userId", userId);
    } catch {
      c.set("userId", "00000000-0000-0000-0000-000000000000");
    }
    await next();
    return;
  }

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
