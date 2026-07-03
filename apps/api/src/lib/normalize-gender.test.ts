import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCatalogGender,
  normalizeProductGender,
} from "./normalize-gender.js";

describe("normalizeProductGender", () => {
  it("maps English male aliases", () => {
    assert.equal(normalizeProductGender("Men"), "male");
    assert.equal(normalizeProductGender("male"), "male");
  });

  it("maps Russian female aliases", () => {
    assert.equal(normalizeProductGender("Женский"), "female");
  });

  it("returns null for unisex, kids and other non-catalog values", () => {
    assert.equal(normalizeProductGender("Unisex"), null);
    assert.equal(normalizeProductGender("Детский"), null);
    assert.equal(normalizeProductGender("Малыши"), null);
    assert.equal(normalizeProductGender("space-suit"), null);
  });

  it("returns null for empty input", () => {
    assert.equal(normalizeProductGender(""), null);
    assert.equal(normalizeProductGender(null), null);
  });

  it("isCatalogGender accepts only male and female", () => {
    assert.equal(isCatalogGender("male"), true);
    assert.equal(isCatalogGender("female"), true);
    assert.equal(isCatalogGender(null), false);
  });
});
