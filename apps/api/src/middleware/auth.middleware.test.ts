import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import {
  buildTestInitData,
  parseTelegramUser,
  validateInitData,
} from "../lib/telegram-auth.js";
import { requireTmaAuth } from "./auth.middleware.js";

const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

describe("requireTmaAuth middleware", () => {
  const app = new Hono();
  app.use("/cart", requireTmaAuth);
  app.get("/cart", (c) => c.json({ userId: c.get("userId") }));
  app.post("/cart", (c) => c.json({ ok: true }));

  it("returns 401 without initData", async () => {
    const res = await app.request("/cart");
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error?: string };
    assert.match(body.error ?? "", /initData/i);
  });

  it("returns 401 on POST without initData", async () => {
    const res = await app.request("/cart", { method: "POST" });
    assert.equal(res.status, 401);
  });

  it("returns 403 when initData signature is invalid", async () => {
    process.env.SHOP_BOT_TOKEN = BOT_TOKEN;
    const res = await app.request("/cart", {
      headers: { "X-Telegram-Init-Data": "user=%7B%22id%22%3A1%7D&hash=bad" },
    });
    assert.equal(res.status, 403);
    delete process.env.SHOP_BOT_TOKEN;
  });
});

describe("validateInitData", () => {
  it("valid initData returns true", () => {
    const initData = buildTestInitData(
      { id: 156484085, first_name: "Admin" },
      BOT_TOKEN,
    );
    assert.equal(validateInitData(initData, BOT_TOKEN), true);
  });

  it("tampered hash returns false", () => {
    const initData = buildTestInitData({ id: 1, first_name: "X" }, BOT_TOKEN);
    const bad = initData.replace(/hash=[a-f0-9]+/, "hash=deadbeef");
    assert.equal(validateInitData(bad, BOT_TOKEN), false);
  });

  it("empty string returns false", () => {
    assert.equal(validateInitData("", BOT_TOKEN), false);
  });

  it("missing auth_date returns false", async () => {
    const params = new URLSearchParams({
      user: JSON.stringify({ id: 1, first_name: "X" }),
    });
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const { createHmac } = await import("node:crypto");
    const secretKey = createHmac("sha256", "WebAppData")
      .update(BOT_TOKEN)
      .digest();
    const hash = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");
    params.set("hash", hash);
    assert.equal(validateInitData(params.toString(), BOT_TOKEN), false);
  });

  it("parses user from initData", () => {
    const initData = buildTestInitData(
      { id: 42, first_name: "Test", username: "tester" },
      BOT_TOKEN,
    );
    const user = parseTelegramUser(initData);
    assert.equal(user?.id, 42);
    assert.equal(user?.username, "tester");
  });
});
