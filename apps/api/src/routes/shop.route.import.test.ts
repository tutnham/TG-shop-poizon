import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zValidator } from "@hono/zod-validator";
import { ImportProductSchema } from "@poizon-shop/shared";
import { Hono } from "hono";
import { requireTmaAuth } from "../middleware/auth.middleware.js";
import { importRateLimit } from "../middleware/import-rate-limit.js";
import type { AppEnv } from "../types/env.types.js";

describe("POST /api/products/import auth", () => {
  const app = new Hono<AppEnv>();
  app.use("/products/import", requireTmaAuth);
  app.use("/products/import", importRateLimit);
  app.post("/products/import", zValidator("json", ImportProductSchema), (c) =>
    c.json({ ok: true }),
  );

  it("returns 401 without initData", async () => {
    const res = await app.request("/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "12345678" }),
    });
    assert.equal(res.status, 401);
  });
});
