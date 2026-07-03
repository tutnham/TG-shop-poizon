import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Pop2Product,
  buildImportableProductIdSet,
  buildProductName,
  buildVariantPricing,
  createCategorySlug,
  extractSizeLabel,
  mapExport3ProductToUpsertRow,
} from "./export3-import.mapper.js";

const rates = {
  rateCnyRub: 10,
  rateCnyUsd: 7,
};

function product(overrides: Partial<Pop2Product> = {}): Pop2Product {
  return {
    productId: 1001,
    variantId: "v-1001",
    url: "https://example.test/product/1001",
    title: "Nike Dunk Low",
    description: "",
    vendorCode: "DD1391-100",
    categoryId: 10,
    vendorId: 1,
    images: ["https://img.test/1.jpg"],
    price: 5000,
    favoriteCount: 12,
    countryOfOrigin: "",
    properties: [],
    seriesName: "Dunk",
    relatedProducts: [],
    gender: "Men",
    sizes: ["42", "43"],
    vat: "",
    currency: "RUB",
    keywords: [],
    vendor: "Nike",
    children: [
      {
        params: [{ key: "Размер", value: "43" }],
        price: 5200,
        available: true,
      },
      {
        params: [{ key: "Размер", value: "42" }],
        price: 4800,
        available: true,
      },
    ],
    ...overrides,
  };
}

describe("export3-import mapper", () => {
  it("extracts size labels from localized child params", () => {
    assert.equal(
      extractSizeLabel([{ key: "Размер производителя", value: "42.5" }]),
      "42.5",
    );
    assert.equal(extractSizeLabel([{ key: "Color", value: "Black" }]), null);
  });

  it("builds per-size prices and stock from product children", () => {
    const mapped = buildVariantPricing(product(), rates);

    assert.deepEqual(mapped.sizes, ["42", "43"]);
    assert.equal(mapped.size_prices["42"]?.rub, 4800);
    assert.equal(mapped.size_prices["42"]?.cny, 480);
    assert.equal(mapped.size_prices["43"]?.usdt, 74.2857);
    assert.equal(mapped.stock["42"], true);
  });

  it("maps an Export3 product to an upsert row with lowest variant price and normalized gender", () => {
    const row = mapExport3ProductToUpsertRow(product(), {
      ...rates,
      categoryCache: new Map([[10, "category-uuid"]]),
    });

    assert.equal(row.status, "mapped");
    assert.equal(row.row.poizon_id, "1001");
    assert.equal(row.row.category_id, "category-uuid");
    assert.equal(row.row.price_rub, 4800);
    assert.equal(row.row.gender, "male");
    assert.deepEqual(row.row.sizes, { EU: ["42", "43"] });
  });

  it("keeps products that are importable by scalar or child price", () => {
    const data = {
      categories: [],
      brands: [],
      products: [
        product({ productId: 1, price: 0, children: [{ price: 4100 }] }),
        product({ productId: 2, price: 3900, children: [] }),
        product({ productId: 3, price: 0, children: [] }),
      ],
    };

    assert.deepEqual([...buildImportableProductIdSet(data)].sort(), ["1", "2"]);
  });

  it("normalizes watch category slugs when watches appear in future exports", () => {
    assert.equal(createCategorySlug("Часы"), "watches");
    assert.equal(createCategorySlug("Watches"), "watches");
  });

  it("builds a readable name without CJK-only title noise", () => {
    assert.equal(
      buildProductName(
        product({
          title: "耐克",
          vendor: "Nike",
          seriesName: "Air Max",
          vendorCode: "AM-001",
        }),
      ),
      "Nike Air Max AM-001",
    );
  });
});
