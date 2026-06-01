import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeSearchQuery } from "../lib/search-sanitize.js";

describe("sanitizeSearchQuery", () => {
  it("strips PostgREST special characters", () => {
    assert.equal(sanitizeSearchQuery("nike),evil"), "nike evil");
  });

  it("limits length", () => {
    assert.equal(sanitizeSearchQuery("a".repeat(200)).length, 100);
  });

  it("collapses whitespace", () => {
    assert.equal(sanitizeSearchQuery("  air   max  "), "air max");
  });
});
