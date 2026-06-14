import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { upsertTelegramUser } from "../db/user.repository.js";
import { parseTelegramUser, validateInitData } from "../lib/telegram-auth.js";
import { getEnvOptional } from "../types/env.types.js";
import type { AppEnv } from "../types/env.types.js";

function getInitDataHeader(c: Context<AppEnv>): string | undefined {
  const value =
    c.req.header("X-Telegram-Init-Data") ??
    c.req.header("x-telegram-init-data");
  return value?.trim() || undefined;
}

function getShopBotToken(): string | undefined {
  const raw = getEnvOptional("SHOP_BOT_TOKEN");
  const token = raw?.trim().replace(/^["']|["']$/g, "");
  return token || undefined;
}

type AuthResult = "ok" | Response;

async function authenticateTelegramUser(
  c: Context<AppEnv>,
  initData: string,
): Promise<AuthResult> {
  const token = getShopBotToken();
  if (!token || !validateInitData(initData, token)) {
    return c.json({ error: "Invalid initData" }, 403);
  }

  const user = parseTelegramUser(initData);
  if (!user) {
    return c.json({ error: "Invalid user" }, 403);
  }

  c.set("telegramUser", user);

  try {
    const userId = await upsertTelegramUser(user);
    c.set("userId", userId);
  } catch (err) {
    console.error(
      "[auth] upsertTelegramUser error",
      err instanceof Error ? err.message : err,
    );
    console.error(
      "[auth:stack]",
      err instanceof Error ? err.stack : "no stack",
    );
    return c.json({ error: "User session unavailable" }, 503);
  }

  return "ok";
}

/** Sets userId when valid initData is present; public catalog works without it. */
export const optionalTmaAuth = createMiddleware<AppEnv>(async (c, next) => {
  const initData = getInitDataHeader(c);
  if (!initData) {
    await next();
    return;
  }

  const result = await authenticateTelegramUser(c, initData);
  if (result !== "ok") return result;
  await next();
});

/** Requires valid Telegram Mini App initData — for cart, orders, profile. */
export const requireTmaAuth = createMiddleware<AppEnv>(async (c, next) => {
  const initData = getInitDataHeader(c);
  if (!initData) {
    return c.json({ error: "Unauthorized — Telegram initData required" }, 401);
  }

  const result = await authenticateTelegramUser(c, initData);
  if (result !== "ok") return result;
  await next();
});

/** @deprecated Use requireTmaAuth or optionalTmaAuth */
export const tmaAuth = requireTmaAuth;
