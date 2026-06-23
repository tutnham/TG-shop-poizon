import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRetryableUpstreamError } from "../lib/upstream-error.js";

describe("upstream-error", () => {
  it("detects rate limit and service unavailable", () => {
    assert.equal(
      isRetryableUpstreamError(
        new Error("Poizon API error: 429 Too Many Requests"),
      ),
      true,
    );
    assert.equal(
      isRetryableUpstreamError(
        new Error("Poizon API error: 503 Service Unavailable"),
      ),
      true,
    );
    assert.equal(isRetryableUpstreamError(new Error("Request timeout")), true);
  });

  it("ignores not found errors", () => {
    assert.equal(
      isRetryableUpstreamError(new Error("Product not found")),
      false,
    );
  });
});
