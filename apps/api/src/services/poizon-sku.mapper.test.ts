import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeOfficialDetailWithPriceInfo,
  parsePoizonDetailResponse,
} from "./poizon-detail.parser.js";
import {
  mapDetailWithPriceSkus,
  mapGoodsInfoSkuList,
  minPriceFen,
  resolveEnglishTitle,
  stripCjk,
} from "./poizon-sku.mapper.js";

describe("poizon-sku.mapper", () => {
  it("stripCjk removes Chinese characters", () => {
    assert.equal(stripCjk("Nike Air 乔丹"), "Nike Air");
  });

  it("resolveEnglishTitle prefers distSpuTitle", () => {
    assert.equal(
      resolveEnglishTitle({
        distSpuTitle: "Nike Dunk Low",
        title: "耐克 Dunk",
      }),
      "Nike Dunk Low",
    );
  });

  it("mapGoodsInfoSkuList maps minBidPrice per size", () => {
    const mapped = mapGoodsInfoSkuList([
      {
        minBidPrice: 499700,
        distStatus: "PRODUCT_ON",
        saleAttr: [
          { enName: "Version", enValue: "Original Shoe Box Included" },
          { enName: "Size", enValue: "42" },
        ],
      },
      {
        minBidPrice: 520000,
        distStatus: "PRODUCT_ON",
        saleAttr: [
          { enName: "Version", enValue: "Original Shoe Box Included" },
          { enName: "Size", enValue: "43" },
        ],
      },
      {
        minBidPrice: 0,
        distStatus: "PRODUCT_ON",
        saleAttr: [{ enName: "Size", enValue: "44" }],
      },
    ]);

    assert.deepEqual(mapped.sizePricesFen, { "42": 499700, "43": 520000 });
    assert.equal(mapped.stock["42"], true);
    assert.equal(mapped.stock["43"], true);
    assert.equal(mapped.stock["44"], false);
  });

  it("mapDetailWithPriceSkus uses sku price in fen", () => {
    const mapped = mapDetailWithPriceSkus([
      {
        status: 1,
        authPrice: 0,
        properties: [
          {
            level: 2,
            saleProperty: { name: "Size", value: "41" },
          },
        ],
        price: { prices: [{ price: 450000 }] },
      },
      {
        status: 1,
        authPrice: 0,
        properties: [
          {
            level: 2,
            saleProperty: { name: "Size", value: "42" },
          },
        ],
        price: { prices: [{ price: 470000 }] },
      },
    ]);

    assert.deepEqual(mapped.sizePricesFen, {
      "41": 450000,
      "42": 470000,
    });
  });

  it("minPriceFen returns minimum available fen", () => {
    assert.equal(minPriceFen({ "41": 450000, "42": 470000 }, 999), 450000);
  });
});

describe("poizon-detail.parser", () => {
  it("parses productDetailWithPrice skus", () => {
    const parsed = parsePoizonDetailResponse(
      {
        detail: {
          spuId: 123,
          title: "耐克 Dunk",
          structureTitle: "Nike Dunk Low Panda",
          logoUrl: "https://img.test/1.jpg",
          status: 1,
          soldCountText: "100",
          sourceName: "Nike",
          articleNumber: "DD1391",
        },
        price: { item: { price: 450000 } },
        skus: [
          {
            status: 1,
            properties: [
              {
                level: 2,
                saleProperty: { name: "Size", value: "42" },
              },
            ],
            price: { prices: [{ price: 450000 }] },
          },
          {
            status: 1,
            properties: [
              {
                level: 2,
                saleProperty: { name: "Size", value: "43" },
              },
            ],
            price: { prices: [{ price: 480000 }] },
          },
        ],
      },
      123,
    );

    assert.ok(parsed);
    assert.equal(parsed!.englishTitle, "Nike Dunk Low Panda");
    assert.equal(parsed!.priceFen, 450000);
    assert.equal(parsed!.sizePricesFen["43"], 480000);
  });

  it("parses goodsInfo skuList wrapper", () => {
    const parsed = parsePoizonDetailResponse({
      result: {
        distSpuTitle: "Jordan 1 Retro High",
        dwSpuId: 81971,
        skuList: [
          {
            minBidPrice: 499700,
            distStatus: "PRODUCT_ON",
            saleAttr: [{ enName: "Size", enValue: "40" }],
          },
        ],
      },
    });

    assert.ok(parsed);
    assert.equal(parsed!.englishTitle, "Jordan 1 Retro High");
    assert.equal(parsed!.sizePricesFen["40"], 499700);
  });

  it("mergeOfficialDetailWithPriceInfo attaches sku prices from priceInfo", () => {
    const merged = mergeOfficialDetailWithPriceInfo(
      {
        detail: {
          spuId: 3771712,
          title: "Adidas AdiFOM Q",
          logoUrl: "https://images.test/1.jpg",
          status: 1,
          articleNumber: "HQ4322",
        },
        skus: [
          {
            skuId: 1001,
            spuId: 3771712,
            status: 1,
            properties: [
              {
                level: 2,
                saleProperty: { name: "Size", value: "42" },
              },
            ],
          },
          {
            skuId: 1002,
            spuId: 3771712,
            status: 1,
            properties: [
              {
                level: 2,
                saleProperty: { name: "Size", value: "43" },
              },
            ],
          },
        ],
      },
      {
        skus: {
          "1001": { prices: [{ price: 450000 }] },
          "1002": { prices: [{ price: 470000 }] },
        },
      },
    );

    const parsed = parsePoizonDetailResponse(merged, 3771712);
    assert.ok(parsed);
    assert.equal(parsed!.spuId, 3771712);
    assert.equal(parsed!.sizePricesFen["42"], 450000);
    assert.equal(parsed!.sizePricesFen["43"], 470000);
    assert.equal(parsed!.priceFen, 450000);
  });
});
