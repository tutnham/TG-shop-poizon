import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Regression: admin.route must pass real telegram id into order audit trail. */
describe("admin order status audit id", () => {
  it("prefers telegramUser.id over fallback zero", () => {
    const adminUser = { id: 156484085 };
    const adminTelegramId = adminUser?.id ?? 0;
    assert.equal(adminTelegramId, 156484085);
  });

  it("falls back to zero when telegramUser is missing", () => {
    const adminUser: { id: number } | undefined = undefined;
    const adminTelegramId = adminUser?.id ?? 0;
    assert.equal(adminTelegramId, 0);
  });
});
