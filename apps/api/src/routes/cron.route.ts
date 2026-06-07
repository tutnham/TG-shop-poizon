import { Hono } from "hono";
import { verifyCronAuth } from "../lib/cron-auth.js";
import { refreshRates } from "../services/currency.service.js";

const cron = new Hono();

cron.get("/rates", async (c) => {
  if (!verifyCronAuth(c.req.header("Authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const rates = await refreshRates(true);
  return c.json({
    ok: true,
    cny_rub: rates.cny_rub,
    usdt_rub: rates.usdt_rub,
    cny_per_usdt: rates.cny_per_usdt,
    updated_at: rates.fetched_at,
    sources: rates.sources,
  });
});

export { cron };
