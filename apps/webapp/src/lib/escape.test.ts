import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml } from "./escape.js";

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    assert.equal(
      escapeHtml('<script>alert("x")</script>'),
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersand in category names", () => {
    assert.equal(escapeHtml("Nike & Adidas"), "Nike &amp; Adidas");
  });

  it("returns empty string for null/undefined", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });
});
