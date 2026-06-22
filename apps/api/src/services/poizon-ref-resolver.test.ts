import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePoizonRef } from "./poizon-ref-resolver.js";

describe("resolvePoizonRef", () => {
  it("resolves numeric spuId", () => {
    assert.deepEqual(resolvePoizonRef("12345678"), {
      kind: "spuId",
      spuId: 12345678,
    });
  });

  it("resolves spuId from dewu URL query", () => {
    assert.deepEqual(
      resolvePoizonRef(
        "https://m.dewu.com/router/product/ProductDetail?spuId=987654321",
      ),
      { kind: "spuId", spuId: 987654321 },
    );
  });

  it("resolves spuId from path segment", () => {
    assert.deepEqual(
      resolvePoizonRef("https://www.poizon.com/product/555551234"),
      {
        kind: "spuId",
        spuId: 555551234,
      },
    );
  });

  it("resolves manufacturer article", () => {
    assert.deepEqual(resolvePoizonRef("DD1391-100"), {
      kind: "article",
      keyword: "DD1391-100",
    });
  });

  it("returns null for empty or garbage input", () => {
    assert.equal(resolvePoizonRef(""), null);
    assert.equal(resolvePoizonRef("   "), null);
    assert.equal(resolvePoizonRef("!!!"), null);
    assert.equal(resolvePoizonRef("1234"), null);
    assert.equal(resolvePoizonRef("https://example.com/no-spu"), null);
  });
});
