import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductDetail } from "@poizon-shop/shared";
import Decimal from "decimal.js";
import type { IPoisonProvider } from "./poizon.provider.js";
import type { SyncPricingContext } from "./pricing.service.js";
import type {
  ShihuoPoparceProvider,
  ShihuoProductFull,
  ShihuoSearchHit,
} from "./shihuo-poparce.provider.js";
import {
  ProductImportError,
  importProductByQuery,
} from "./product-import.service.js";

const pricingCtx: SyncPricingContext = {
  rateCnyRub: new Decimal(10),
  rateCnyUsd: new Decimal(7),
  markupPercent: new Decimal(25),
  deliveryFee: new Decimal(0),
};

const mockProduct: ProductDetail = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Mock Product",
  name_ru: null,
  brand: "Nike",
  image_url: "https://images.test/1.jpg",
  image_urls: ["https://images.test/1.jpg"],
  price_rub: 5630,
  price_usdt: 8.1,
  price_cny: 450,
  is_available: true,
  sold_count: 50,
  sizes: { EU: ["42", "43"] },
  stock: { "42": true, "43": true },
  size_prices: {
    "42": { cny: 450, rub: 5630, usdt: 8.1 },
    "43": { cny: 520, rub: 6500, usdt: 9.3 },
  },
  category_id: null,
};

class TestPoisonProvider implements IPoisonProvider {
  async searchProducts(keyword: string) {
    return {
      items: [
        {
          spuId: 100001,
          title: keyword,
          englishTitle: keyword,
          brand: "Nike",
          logoUrl: "https://images.test/1.jpg",
          priceFen: 45000,
          inStock: true,
          images: ["https://images.test/1.jpg"],
          sizes: { "42": true },
          sizePricesFen: { "42": 45000 },
          soldCount: 1,
        },
      ],
      hasMore: false,
      total: 1,
    };
  }

  async getProductDetail(spuId: number) {
    return {
      spuId,
      title: "Mock Product",
      englishTitle: "Mock Product",
      brand: "Nike",
      logoUrl: "https://images.test/1.jpg",
      priceFen: 45000,
      inStock: true,
      images: ["https://images.test/1.jpg"],
      sizes: { "42": true, "43": true },
      sizePricesFen: { "42": 45000, "43": 52000 },
      soldCount: 50,
    };
  }

  async getCategories() {
    return [{ id: 1, name: "Sneakers" }];
  }
}

describe("importProductByQuery", () => {
  it("imports by numeric spuId and upserts with user_import source path", async () => {
    let upsertedPoizonId = "";
    const product = await importProductByQuery("100001", {
      provider: new TestPoisonProvider(),
      buildPricingContext: async () => pricingCtx,
      refreshRatesFn: async () => {},
      upsertImportedProduct: async (row) => {
        upsertedPoizonId = row.poizon_id;
        assert.equal(row.name, "Mock Product");
        assert.equal(row.price_rub, 5630);
      },
      getProductByPoizonId: async () => mockProduct,
    });

    assert.equal(upsertedPoizonId, "100001");
    assert.equal(product.id, mockProduct.id);
  });

  it("imports by article via searchProducts", async () => {
    let searched = false;
    const provider = new TestPoisonProvider();
    const originalSearch = provider.searchProducts.bind(provider);
    provider.searchProducts = async (keyword, limit, page) => {
      searched = true;
      assert.equal(keyword, "DD1391-100");
      assert.equal(limit, 20);
      assert.equal(page, 0);
      return originalSearch(keyword, limit, page);
    };

    await importProductByQuery("DD1391-100", {
      provider,
      buildPricingContext: async () => pricingCtx,
      refreshRatesFn: async () => {},
      upsertImportedProduct: async () => {},
      getProductByPoizonId: async () => mockProduct,
    });

    assert.equal(searched, true);
  });

  it("matches articleNumber in search results instead of first item", async () => {
    class MultiResultProvider extends TestPoisonProvider {
      async searchProducts() {
        return {
          items: [
            {
              spuId: 999,
              title: "Wrong shoe",
              englishTitle: "Wrong shoe",
              brand: "Nike",
              logoUrl: "https://images.test/wrong.jpg",
              priceFen: 10000,
              inStock: true,
              images: [],
              sizes: {},
              sizePricesFen: {},
              soldCount: 0,
              articleNumber: "ABC-123",
            },
            {
              spuId: 100001,
              title: "Air Jordan 1",
              englishTitle: "Air Jordan 1",
              brand: "Jordan",
              logoUrl: "https://images.test/1.jpg",
              priceFen: 45000,
              inStock: true,
              images: ["https://images.test/1.jpg"],
              sizes: { "42": true },
              sizePricesFen: { "42": 45000 },
              soldCount: 1,
              articleNumber: "DD1391-100",
            },
          ],
          hasMore: false,
          total: 2,
        };
      }
    }

    let importedSpuId = "";
    await importProductByQuery("DD1391-100", {
      provider: new MultiResultProvider(),
      buildPricingContext: async () => pricingCtx,
      refreshRatesFn: async () => {},
      upsertImportedProduct: async (row) => {
        importedSpuId = row.poizon_id;
      },
      getProductByPoizonId: async () => mockProduct,
    });

    assert.equal(importedSpuId, "100001");
  });

  it("falls back to Shihuo when Poizon search misses article", async () => {
    class EmptySearchProvider extends TestPoisonProvider {
      async searchProducts() {
        return { items: [], hasMore: false, total: 0 };
      }
    }

    const shihuoHit: ShihuoSearchHit = {
      goodsId: "7600174",
      styleId: "4244972",
      name: "Nike Dunk Low Panda",
      priceCny: 450,
    };

    const shihuoFull: ShihuoProductFull = {
      goodsId: "7600174",
      styleId: "4244972",
      name: "Nike Dunk Low Panda",
      images: ["https://images.test/shihuo.jpg"],
      sizePricesCny: { "42": 450, "43": 470 },
      stock: { "42": true, "43": true },
    };

    const shihuoProvider = {
      searchByArticle: async (vendorCode: string) => {
        assert.equal(vendorCode, "DD1391-100");
        return shihuoHit;
      },
      fetchProductFull: async () => shihuoFull,
      fetchPrice: async () => null,
    } as unknown as ShihuoPoparceProvider;

    let upsertedPoizonId = "";
    const product = await importProductByQuery("DD1391-100", {
      provider: new EmptySearchProvider(),
      shihuoProvider,
      buildPricingContext: async () => pricingCtx,
      refreshRatesFn: async () => {},
      upsertImportedProduct: async (row) => {
        upsertedPoizonId = row.poizon_id;
        assert.equal(row.shihuo_goods_id, "7600174");
        assert.equal(row.shihuo_style_id, "4244972");
        assert.equal(row.name, "Nike Dunk Low Panda");
      },
      getProductByPoizonId: async () => mockProduct,
    });

    assert.equal(upsertedPoizonId, "shihuo:7600174:4244972");
    assert.equal(product.id, mockProduct.id);
  });

  it("falls back to Shihuo when Poizon getProductDetail fails with non-retryable error", async () => {
    class DetailFailProvider extends TestPoisonProvider {
      async getProductDetail() {
        throw new Error("Poizon API error: 400 Bad Request — invalid spu");
      }
    }

    const shihuoHit: ShihuoSearchHit = {
      goodsId: "3550572",
      styleId: "72253127",
      name: "adidas Adifom Climacool",
      priceCny: 187,
    };

    const shihuoFull: ShihuoProductFull = {
      goodsId: "3550572",
      styleId: "72253127",
      name: "adidas Adifom Climacool",
      images: ["https://images.test/if3909.jpg"],
      sizePricesCny: { "42": 187 },
      stock: { "42": true },
    };

    const shihuoProvider = {
      searchByArticle: async () => shihuoHit,
      fetchProductFull: async () => shihuoFull,
      fetchPrice: async () => null,
    } as unknown as ShihuoPoparceProvider;

    let upsertedPoizonId = "";
    let upsertedImages: string[] = [];
    await importProductByQuery("IF3909", {
      provider: new DetailFailProvider(),
      shihuoProvider,
      buildPricingContext: async () => pricingCtx,
      refreshRatesFn: async () => {},
      upsertImportedProduct: async (row) => {
        upsertedPoizonId = row.poizon_id;
        upsertedImages = row.image_urls;
      },
      getProductByPoizonId: async () => mockProduct,
    });

    assert.equal(upsertedPoizonId, "shihuo:3550572:72253127");
    assert.ok(upsertedImages.length > 0);
  });

  it("throws upstream_unavailable when Poizon match found but detail is retryable", async () => {
    class MatchThenFailProvider extends TestPoisonProvider {
      async searchProducts() {
        return {
          items: [
            {
              spuId: 3771712,
              title: "Adidas AdiFOM Q",
              englishTitle: "Adidas AdiFOM Q",
              brand: "adidas",
              logoUrl: "https://images.test/1.jpg",
              priceFen: 0,
              inStock: true,
              images: ["https://images.test/1.jpg"],
              sizes: {},
              sizePricesFen: {},
              soldCount: 0,
              articleNumber: "HQ4322",
            },
          ],
          hasMore: false,
          total: 1,
        };
      }

      async getProductDetail() {
        throw new Error("Poizon API error: 503 Service Unavailable");
      }
    }

    await assert.rejects(
      () =>
        importProductByQuery("HQ4322", {
          provider: new MatchThenFailProvider(),
          buildPricingContext: async () => pricingCtx,
          refreshRatesFn: async () => {},
        }),
      (err: unknown) => {
        assert.ok(err instanceof ProductImportError);
        assert.equal(err.code, "upstream_unavailable");
        return true;
      },
    );
  });

  it("throws invalid for garbage input", async () => {
    await assert.rejects(
      () =>
        importProductByQuery("!!!", {
          provider: new TestPoisonProvider(),
        }),
      (err: unknown) => {
        assert.ok(err instanceof ProductImportError);
        assert.equal(err.code, "invalid");
        return true;
      },
    );
  });

  it("throws not_found when detail is missing", async () => {
    const provider = new TestPoisonProvider();
    provider.getProductDetail = async () => null;

    await assert.rejects(
      () =>
        importProductByQuery("100001", {
          provider,
          buildPricingContext: async () => pricingCtx,
          refreshRatesFn: async () => {},
        }),
      (err: unknown) => {
        assert.ok(err instanceof ProductImportError);
        assert.equal(err.code, "not_found");
        return true;
      },
    );
  });
});
