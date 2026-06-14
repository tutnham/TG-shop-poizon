import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { verifyCronAuth } from "./cron-auth.js";

describe("verifyCronAuth", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("allows requests without secret outside production", () => {
    process.env.NODE_ENV = "development";
    Reflect.deleteProperty(process.env, "CRON_SECRET");
    assert.equal(verifyCronAuth(undefined), true);
  });

  it("rejects missing Bearer in production when secret is set", () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "a".repeat(32);
    assert.equal(verifyCronAuth(undefined), false);
    assert.equal(verifyCronAuth("Basic x"), false);
  });

  it("accepts valid Bearer token", () => {
    const secret = "test-cron-secret-32-chars-min!!";
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = secret;
    assert.equal(verifyCronAuth(`Bearer ${secret}`), true);
    assert.equal(verifyCronAuth("Bearer wrong-secret-32-chars-min!!"), false);
  });
});
