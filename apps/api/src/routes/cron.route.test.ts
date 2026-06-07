import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Hono } from "hono";
import { cron } from "./cron.route.js";

describe("GET /cron/rates", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("returns 401 without auth in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "cron-test-secret-32-characters!!";
    const app = new Hono().route("/cron", cron);
    const res = await app.request("/cron/rates");
    assert.equal(res.status, 401);
  });

  it("returns 200 with valid Bearer in production", async () => {
    const secret = "cron-test-secret-32-characters!!";
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = secret;
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";

    const app = new Hono().route("/cron", cron);
    const res = await app.request("/cron/rates", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });
});
