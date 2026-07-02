import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeProductGender } from "./normalize-gender.js";

describe("normalizeProductGender", () => {
  it("maps English male aliases", () => {
    assert.equal(normalizeProductGender("Men"), "male");
    assert.equal(normalizeProductGender("male"), "male");
  });

  it("maps Russian female aliases", () => {
    assert.equal(normalizeProductGender("Женский"), "female");
  });

  it("maps unisex and kids", () => {
    assert.equal(normalizeProductGender("Unisex"), "unisex");
    assert.equal(normalizeProductGender("Детский"), "kids");
  });

  it("returns null for empty input", () => {
    assert.equal(normalizeProductGender(""), null);
    assert.equal(normalizeProductGender(null), null);
  });

  it("returns unknown for unrecognized values", () => {
    assert.equal(normalizeProductGender("space-suit"), "unknown");
  });
});
