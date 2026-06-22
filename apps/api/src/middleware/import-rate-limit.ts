import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/env.types.js";

const hits = new Map<string, { count: number; reset: number }>();
const MAX_IMPORTS_PER_MINUTE = 10;

const importRateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now > entry.reset) hits.delete(key);
  }
}, 120000);
importRateLimitCleanup.unref();

/** Rate limit for product import by authenticated user (10/min). */
export const importRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized — Telegram initData required" }, 401);
  }

  const key = `import:${userId}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.reset) {
    hits.set(key, { count: 1, reset: now + 60000 });
  } else {
    entry.count++;
    if (entry.count > MAX_IMPORTS_PER_MINUTE) {
      return c.json({ error: "Import rate limit exceeded" }, 429);
    }
  }

  await next();
});
