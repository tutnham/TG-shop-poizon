import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/env.types.js";

const hits = new Map<string, { count: number; reset: number }>();

const mutationRateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now > entry.reset) hits.delete(key);
  }
}, 120000);
mutationRateLimitCleanup.unref();

/** Rate limit for authenticated mutations (cart, orders) by userId or IP. */
export const mutationRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown";
  const key = userId ? `user:${userId}` : `ip:${ip}`;

  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.reset) {
    hits.set(key, { count: 1, reset: now + 60000 });
  } else {
    entry.count++;
    if (entry.count > 30) {
      return c.json({ error: "Rate limit" }, 429);
    }
  }
  await next();
});
