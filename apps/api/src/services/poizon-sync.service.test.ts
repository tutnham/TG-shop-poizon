import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { VERCEL_SYNC_BLOCKED_MESSAGE } from "../lib/runtime.js";

describe("runFullSync on Vercel", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
    delete process.env.VERCEL;
  });

  it("returns error without starting sync when VERCEL=1", async () => {
    process.env.VERCEL = "1";
    const { runFullSync } = await import("./poizon-sync.service.js");
    const result = await runFullSync();
    assert.equal(result.ok, false);
    assert.equal(result.items_synced, 0);
    assert.equal(result.error, VERCEL_SYNC_BLOCKED_MESSAGE);
  });
});
