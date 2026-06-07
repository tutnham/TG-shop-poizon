import { Hono } from "hono";
import { isSupabaseConfigured } from "./db/client.js";
import { runStartupChecks } from "./lib/startup-checks.js";
import { createCors } from "./middleware/cors.middleware.js";
import { cron } from "./routes/cron.route.js";
import { proxy } from "./routes/image-proxy.route.js";
import { shop } from "./routes/shop.route.js";
import { webhooks } from "./routes/webhooks.route.js";
import { getRatesHealth } from "./services/currency.service.js";
import type { AppEnv } from "./types/env.types.js";

export function createApp() {
  runStartupChecks();

  const app = new Hono<AppEnv>();

  app.use("*", createCors());

  app.onError((err, c) => {
    console.error("[api]", err);
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

  app.route("/api", shop);
  app.route("/cron", cron);
  app.route("/webhook", webhooks);
  app.route("/api/image-proxy", proxy);

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}
