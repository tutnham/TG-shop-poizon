import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Hono } from "hono";
import { webhookSecret } from "../middleware/webhook.middleware.js";

describe("webhookSecret middleware", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("rejects wrong secret token", async () => {
    process.env.WEBHOOK_SECRET = "webhook-secret-32-characters-min!!";
    const app = new Hono();
    app.use("*", webhookSecret);
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "wrong-secret-32-characters-min!!",
      },
    });
    assert.equal(res.status, 403);
  });

  it("accepts matching secret token", async () => {
    const secret = "webhook-secret-32-characters-min!!";
    process.env.WEBHOOK_SECRET = secret;
    const app = new Hono();
    app.use("*", webhookSecret);
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
    });
    assert.equal(res.status, 200);
  });

  it("rejects production requests when WEBHOOK_SECRET is missing", async () => {
    process.env.WEBHOOK_SECRET = undefined;
    process.env.NODE_ENV = "production";
    const app = new Hono();
    app.use("*", webhookSecret);
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", { method: "POST" });
    assert.equal(res.status, 403);
  });
});
