import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTestInitData,
  parseTelegramUser,
  validateInitData,
} from "../lib/telegram-auth.js";

const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

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
