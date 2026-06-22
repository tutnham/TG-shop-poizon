import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductDetail } from "@poizon-shop/shared";
import Decimal from "decimal.js";
import type { IPoisonProvider } from "./poizon.provider.js";
import type { SyncPricingContext } from "./pricing.service.js";
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
      assert.equal(limit, 5);
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
