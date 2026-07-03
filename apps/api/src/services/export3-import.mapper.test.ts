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
  resolveImportGender,
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

  it("keeps all priced products regardless of gender label", () => {
    const data = {
      categories: [],
      brands: [],
      products: [
        product({ productId: 1, price: 0, children: [{ price: 4100 }] }),
        product({ productId: 2, price: 3900, children: [] }),
        product({ productId: 3, price: 0, children: [] }),
        product({ productId: 4, price: 3900, gender: "Малыши" }),
        product({ productId: 5, price: 3900, gender: "Unisex" }),
        product({ productId: 6, price: 3900, gender: "" }),
      ],
    };

    assert.deepEqual(
      [...buildImportableProductIdSet(data)].sort(),
      ["1", "2", "4", "5", "6"],
    );
  });

  it("imports products with an empty gender field as gender=null", () => {
    const row = mapExport3ProductToUpsertRow(
      product({ gender: "" }),
      {
        ...rates,
        categoryCache: new Map([[10, "category-uuid"]]),
      },
    );

    assert.equal(row.status, "mapped");
    if (row.status === "mapped") {
      assert.equal(row.row.gender, null);
    }
  });

  it("imports explicit non-catalog gender labels with gender=null", () => {
    const row = mapExport3ProductToUpsertRow(
      product({ gender: "Малыши" }),
      {
        ...rates,
        categoryCache: new Map([[10, "category-uuid"]]),
      },
    );

    assert.equal(row.status, "mapped");
    if (row.status === "mapped") {
      assert.equal(row.row.gender, null);
    }
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

  it("infers male gender for Unisex watches from title", () => {
    const watch = product({
      title: "Механический механизм Tissot Мужские часы PR100",
      gender: "Унисекс",
      price: 28125,
      children: [],
      sizes: [],
    });

    assert.equal(resolveImportGender(watch), "male");

    const row = mapExport3ProductToUpsertRow(watch, {
      ...rates,
      categoryCache: new Map([[10, "category-uuid"]]),
    });

    assert.equal(row.status, "mapped");
    if (row.status === "mapped") {
      assert.equal(row.row.gender, "male");
      assert.equal(row.row.price_rub, 28125);
      assert.deepEqual(row.row.sizes, {});
      assert.deepEqual(row.row.stock, {});
    }
  });

  it("infers female gender for Unisex watches from title", () => {
    const watch = product({
      title: "Часы SWATCH Женские Часы 42 мм",
      gender: "Унисекс",
      price: 12000,
      children: [],
    });

    assert.equal(resolveImportGender(watch), "female");

    const row = mapExport3ProductToUpsertRow(watch, {
      ...rates,
      categoryCache: new Map([[10, "category-uuid"]]),
    });

    assert.equal(row.status, "mapped");
    if (row.status === "mapped") {
      assert.equal(row.row.gender, "female");
    }
  });

  it("imports Unisex watches without explicit male/female hints as gender=null", () => {
    const watch = product({
      title: "SWATCH Автоматический Механический механизм Унисекс Часы",
      gender: "Унисекс",
      price: 15000,
      children: [],
    });

    assert.equal(resolveImportGender(watch), null);

    const row = mapExport3ProductToUpsertRow(watch, {
      ...rates,
      categoryCache: new Map([[10, "category-uuid"]]),
    });

    assert.equal(row.status, "mapped");
    if (row.status === "mapped") {
      assert.equal(row.row.gender, null);
      assert.equal(row.row.price_rub, 15000);
    }
  });

  it("includes all priced Unisex products in importable set", () => {
    const data = {
      categories: [],
      brands: [],
      products: [
        product({
          productId: 10,
          title: "Tissot Мужские часы PR100",
          gender: "Унисекс",
          price: 28125,
          children: [],
        }),
        product({
          productId: 11,
          title: "SWATCH Унисекс Часы",
          gender: "Унисекс",
          price: 15000,
          children: [],
        }),
      ],
    };

    assert.deepEqual([...buildImportableProductIdSet(data)].sort(), ["10", "11"]);
  });
});
