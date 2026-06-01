import { createMiddleware } from "hono/factory";
import { getEnvOptional, isProduction } from "../types/env.types.js";

const hits = new Map<string, { count: number; reset: number }>();

export const webhookSecret = createMiddleware(async (c, next) => {
  const secret = getEnvOptional("WEBHOOK_SECRET");
  const header = c.req.header("X-Telegram-Bot-Api-Secret-Token");

  if (isProduction() && !secret) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (secret && header !== secret) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (isProduction() && secret.length < 32) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
});

export const webhookRateLimit = createMiddleware(async (c, next) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown";
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + 60000 });
  } else {
    entry.count++;
    if (entry.count > 60) {
      return c.json({ error: "Rate limit" }, 429);
    }
  }
  await next();
});
