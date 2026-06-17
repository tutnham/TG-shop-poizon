import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  parseMinSupplierPriceCny,
  parseSearchByArticleResponse,
} from "./shihuo-poparce.provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const priceSample = JSON.parse(
  readFileSync(join(__dirname, "../../shihuo-price-sample.json"), "utf-8"),
) as unknown;

describe("shihuo-poparce.provider parsers", () => {
  it("parseSearchByArticleResponse reads items[0] with goodsId/styleId/name/price", () => {
    const hit = parseSearchByArticleResponse(
      {
        items: [
          {
            goodsId: "397",
            styleId: "4244972",
            name: "Nike Air Force 1",
            price: "529",
            vendorCode: "DD1391-100",
          },
        ],
      },
      "DD1391-100",
    );

    assert.ok(hit);
    assert.equal(hit!.goodsId, "397");
    assert.equal(hit!.styleId, "4244972");
    assert.equal(hit!.name, "Nike Air Force 1");
    assert.equal(hit!.priceCny, 529);
  });

  it("parseSearchByArticleResponse rejects non-relevant search results", () => {
    const hit = parseSearchByArticleResponse(
      {
        items: [
          {
            goodsId: "999",
            styleId: "1",
            name: "Unrelated Product",
            vendorCode: "OTHER-123",
          },
        ],
      },
      "DD1391-100",
    );

    assert.equal(hit, null);
  });

  it("parseSearchByArticleResponse accepts normalized article match", () => {
    const hit = parseSearchByArticleResponse(
      {
        items: [
          {
            goodsId: "100",
            styleId: "200",
            articleNumber: "dd1391 100",
            title: "AF1",
          },
        ],
      },
      "DD1391-100",
    );

    assert.ok(hit);
    assert.equal(hit!.goodsId, "100");
  });

  it("parseMinSupplierPriceCny returns min from string supplier prices", () => {
    const min = parseMinSupplierPriceCny(priceSample);
    assert.equal(min, 417);
  });

  it("parseMinSupplierPriceCny ignores invalid and zero supplier prices", () => {
    const min = parseMinSupplierPriceCny({
      suppliers: [
        { price: "0" },
        { price: "" },
        { price: "abc" },
        { price: "500" },
        { displayPrice: "450" },
      ],
    });
    assert.equal(min, 450);
  });

  it("parseMinSupplierPriceCny returns null when no valid suppliers", () => {
    assert.equal(parseMinSupplierPriceCny({ suppliers: [] }), null);
    assert.equal(parseMinSupplierPriceCny({}), null);
    assert.equal(
      parseMinSupplierPriceCny({ suppliers: [{ price: "0" }, {}] }),
      null,
    );
  });
});
