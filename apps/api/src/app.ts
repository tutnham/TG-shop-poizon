import { Hono } from "hono";
import { isSupabaseConfigured } from "./db/client.js";
import { runStartupChecks } from "./lib/startup-checks.js";
import { createCors } from "./middleware/cors.middleware.js";
import { admin } from "./routes/admin.route.js";
import { cron } from "./routes/cron.route.js";
import { proxy } from "./routes/image-proxy.route.js";
import { shop } from "./routes/shop.route.js";
import { webhooks } from "./routes/webhooks.route.js";
import { getRatesHealth } from "./services/currency.service.js";
import type { AppEnv } from "./types/env.types.js";

function securityHeaders() {
  return async (
    c: { res: { headers: Headers } },
    next: () => Promise<void>,
  ) => {
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("X-Frame-Options", "DENY");
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    c.res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
    await next();
  };
}

export function createApp() {
  runStartupChecks();

  const app = new Hono<AppEnv>();

  app.use("*", createCors());
  app.use("*", securityHeaders());

  app.onError((err, c) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api]", msg);
    console.error("[api:stack]", err instanceof Error ? err.stack : "no stack");
    return c.json({ error: "Internal server error" }, 500);
  });

  app.get("/health", async (c) => {
    const rates = await getRatesHealth();
    return c.json({
      ok: true,
      supabase: isSupabaseConfigured(),
      ts: new Date().toISOString(),
      last_rates_at: rates.last_rates_at,
      rates_stale: rates.rates_stale,
    });
  });

  app.route("/api/admin", admin);
  app.route("/api", shop);
  app.route("/cron", cron);
  app.route("/webhook", webhooks);
  app.route("/api/image-proxy", proxy);

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}
