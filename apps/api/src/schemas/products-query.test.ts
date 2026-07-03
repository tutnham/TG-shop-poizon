import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProductsQuerySchema } from "@poizon-shop/shared";

describe("ProductsQuerySchema", () => {
  it("accepts size and gender filters", () => {
    const parsed = ProductsQuerySchema.parse({
      page: "1",
      limit: "20",
      size: "42",
      gender: "male",
    });
    assert.equal(parsed.size, "42");
    assert.equal(parsed.gender, "male");
  });

  it("rejects invalid gender", () => {
    assert.throws(() => ProductsQuerySchema.parse({ gender: "alien" }));
  });
});
