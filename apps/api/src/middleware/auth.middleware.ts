import crypto from "node:crypto";
import { createMiddleware } from "hono/factory";
import { ensureGuestUser, upsertTelegramUser } from "../db/user.repository.js";
import { parseTelegramUser, validateInitData } from "../lib/telegram-auth.js";
import { getEnvOptional } from "../types/env.types.js";
import type { AppEnv } from "../types/env.types.js";

function fallbackUserId(telegramId: number): string {
  const hash = crypto.createHash("sha256").update(String(telegramId)).digest();
  return [
    Buffer.from(hash.subarray(0, 4)).toString("hex"),
    Buffer.from(hash.subarray(4, 6)).toString("hex"),
    Buffer.from(hash.subarray(6, 8)).toString("hex"),
    Buffer.from(hash.subarray(8, 10)).toString("hex"),
    Buffer.from(hash.subarray(10, 16)).toString("hex"),
  ].join("-");
}

export const tmaAuth = createMiddleware<AppEnv>(async (c, next) => {
  const initData =
    c.req.header("X-Telegram-Init-Data") ??
    c.req.header("x-telegram-init-data");

  if (!initData) {
    // Guest mode: ensure guest user exists in DB, then allow browsing
    const guestId = await ensureGuestUser();
    c.set("userId", guestId);
    await next();
    return;
  }

  const token = getEnvOptional("SHOP_BOT_TOKEN")
    ?.trim()
    .replace(/^["']|["']$/g, "");
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
    // Fallback: ensure a user row exists so cart FK does not fail
    const fbId = fallbackUserId(user.id);
    try {
      const ensuredId = await ensureGuestUser(fbId, user.id);
      c.set("userId", ensuredId);
    } catch {
      c.set("userId", fbId);
    }
  }
  await next();
});
