import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeByNameRu,
  dedupeDisplayLabels,
  normalizeLabelKey,
} from "./dedupe-labels.js";

describe("normalizeLabelKey", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeLabelKey("  Nike  "), "nike");
  });
});

describe("dedupeDisplayLabels", () => {
  it("merges case and whitespace variants", () => {
    const result = dedupeDisplayLabels(["Nike", "NIKE", " Nike "]);
    assert.deepEqual(result, ["Nike"]);
  });

  it("drops empty strings", () => {
    const result = dedupeDisplayLabels(["", "  ", "Adidas"]);
    assert.deepEqual(result, ["Adidas"]);
  });

  it("sorts alphabetically with ru locale", () => {
    const result = dedupeDisplayLabels(["Jordan", "Adidas", "Nike"]);
    assert.deepEqual(result, ["Adidas", "Jordan", "Nike"]);
  });

  it("keeps first canonical spelling", () => {
    const result = dedupeDisplayLabels(["NIKE", "Nike"]);
    assert.deepEqual(result, ["NIKE"]);
  });
});

describe("dedupeByNameRu", () => {
  it("deduplicates categories by name_ru", () => {
    const items = [
      { id: "1", name: "Sneakers", name_ru: "Кроссовки", slug: "sneakers" },
      { id: "2", name: "Shoes", name_ru: "Кроссовки", slug: "кроссовки" },
      { id: "3", name: "Apparel", name_ru: "Одежда", slug: "apparel" },
    ];
    const result = dedupeByNameRu(items);
    assert.equal(result.length, 2);
    assert.equal(result[0]?.name_ru, "Кроссовки");
    assert.equal(result[0]?.slug, "sneakers");
    assert.equal(result[1]?.name_ru, "Одежда");
  });
});
