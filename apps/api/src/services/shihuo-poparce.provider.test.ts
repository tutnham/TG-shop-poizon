import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseMinSupplierPriceCny,
  parseProductFullResponse,
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
    assert.equal(hit?.goodsId, "397");
    assert.equal(hit?.styleId, "4244972");
    assert.equal(hit?.name, "Nike Air Force 1");
    assert.equal(hit?.priceCny, 529);
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

  it("parseSearchByArticleResponse falls back to items[0] when API omits article fields", () => {
    const hit = parseSearchByArticleResponse(
      {
        query: "1011B721-001",
        items: [
          {
            goodsId: "1795432",
            styleId: "46219528",
            name: "亚瑟士 Gel-Kayano 29",
            price: "699",
          },
        ],
      },
      "1011B721-001",
    );

    assert.ok(hit);
    assert.equal(hit?.goodsId, "1795432");
    assert.equal(hit?.styleId, "46219528");
    assert.equal(hit?.priceCny, 699);
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
    assert.equal(hit?.goodsId, "100");
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

  it("parseProductFullResponse reads sizes[] with direct price fields", () => {
    const parsed = parseProductFullResponse(
      {
        goodsId: "397",
        styleId: "4244972",
        title: "Nike AF1",
        sizes: [
          { size: "42", price: "529", available: true },
          { size: "43", price: "586", available: true },
          { size: "44", price: "600", available: false },
        ],
      },
      "397",
    );

    assert.ok(parsed);
    assert.equal(parsed?.goodsId, "397");
    assert.equal(parsed?.styleId, "4244972");
    assert.equal(parsed?.name, "Nike AF1");
    assert.equal(parsed?.sizePricesCny["42"], 529);
    assert.equal(parsed?.sizePricesCny["43"], 586);
    assert.equal(parsed?.sizePricesCny["44"], undefined);
    assert.equal(parsed?.stock["42"], true);
    assert.equal(parsed?.stock["43"], true);
    assert.equal(parsed?.stock["44"], false);
  });

  it("parseProductFullResponse reads skuList[] with saleAttr and minBidPrice (fen)", () => {
    const parsed = parseProductFullResponse({
      goodsId: "100",
      skuList: [
        {
          minBidPrice: 45000,
          saleAttr: [{ enName: "Size", enValue: "42" }],
        },
        {
          minBidPrice: 52000,
          saleAttr: [{ enName: "Size", enValue: "43" }],
        },
      ],
    });

    assert.ok(parsed);
    assert.equal(parsed?.sizePricesCny["42"], 450);
    assert.equal(parsed?.sizePricesCny["43"], 520);
  });

  it("parseProductFullResponse reads nested suppliers[] per size entry", () => {
    const parsed = parseProductFullResponse({
      goodsId: "397",
      sizeList: [
        {
          sizeValue: "42",
          suppliers: [{ price: "500" }, { price: "417" }],
        },
      ],
    });

    assert.ok(parsed);
    assert.equal(parsed?.sizePricesCny["42"], 417);
    assert.equal(parsed?.stock["42"], true);
  });

  it("parseProductFullResponse excludes available=false even with price", () => {
    const parsed = parseProductFullResponse({
      goodsId: "1",
      sizes: [{ size: "42", price: "500", available: false }],
    });

    assert.ok(parsed);
    assert.equal(parsed?.sizePricesCny["42"], undefined);
    assert.equal(parsed?.stock["42"], false);
  });

  it("parseProductFullResponse reads logoUrl and nested gallery images", () => {
    const parsed = parseProductFullResponse(
      {
        goodsId: "397",
        logoUrl: "https://images.test/cover.jpg",
        gallery: ["https://images.test/1.jpg", "https://images.test/2.jpg"],
      },
      "397",
    );

    assert.ok(parsed);
    assert.deepEqual(parsed?.images, [
      "https://images.test/cover.jpg",
      "https://images.test/1.jpg",
      "https://images.test/2.jpg",
    ]);
  });

  it("parseProductFullResponse returns empty sizePricesCny when no priced sizes", () => {
    const parsed = parseProductFullResponse({
      goodsId: "1",
      sizes: [{ size: "42", available: false }],
    });

    assert.ok(parsed);
    assert.deepEqual(parsed?.sizePricesCny, {});
  });
});
