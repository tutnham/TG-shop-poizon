import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifySecretToken } from "./verify-secret.js";

describe("verifySecretToken", () => {
  it("accepts matching secrets", () => {
    const secret = "webhook-secret-32-characters-min!!";
    assert.equal(verifySecretToken(secret, secret), true);
  });

  it("rejects wrong secrets", () => {
    const secret = "webhook-secret-32-characters-min!!";
    assert.equal(
      verifySecretToken("webhook-secret-32-characters-max!!", secret),
      false,
    );
  });

  it("rejects empty provided value", () => {
    assert.equal(verifySecretToken(undefined, "secret"), false);
  });
});
