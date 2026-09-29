import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Decimal } from "decimal.js";
import {
  type RawExcelRow,
  computeExcelPrices,
  mapExcelRowToUpsertRow,
  matchExcelHeaders,
  normalizeImageUrl,
  parseCurrency,
  parsePrice,
  resolveExcelGender,
  splitImages,
  splitSizes,
} from "./excel-import.mapper.js";
import type { SyncPricingContext } from "./pricing.service.js";

const pricingCtx: SyncPricingContext = {
  rateCnyRub: new Decimal("12"),
  rateCnyUsd: new Decimal("7.2"),
  markupPercent: new Decimal("25"),
  deliveryFee: new Decimal("0"),
};

const mapCtx = {
  pricingCtx,
  defaultCurrency: "CNY" as const,
  requireImages: false,
  resolveCategoryId: (name: string) => (name === "Кроссовки" ? "cat-1" : null),
};

function row(fields: RawExcelRow["fields"], rowNum = 2): RawExcelRow {
  return { rowNum, fields };
}

describe("excel-import mapper", () => {
  it("matches RU headers by aliases", () => {
    const { mapping, unrecognized } = matchExcelHeaders([
      "Артикул",
      "Название товара",
      "Бренд",
      "Цена",
      "Размеры",
      "Комментарий",
    ]);
    assert.equal(mapping.article, 0);
    assert.equal(mapping.name, 1);
    assert.equal(mapping.brand, 2);
    assert.equal(mapping.price, 3);
    assert.equal(mapping.sizes, 4);
    assert.deepEqual(unrecognized, ["Комментарий"]);
  });

  it("does not match garbage headers", () => {
    const { mapping } = matchExcelHeaders(["Foo", "Bar", "Baz"]);
    assert.equal(mapping.article, undefined);
    assert.equal(mapping.price, undefined);
  });

  it("prefers exact match over partial", () => {
    const { mapping } = matchExcelHeaders(["Код", "Код товара", "Цена"]);
    assert.equal(mapping.article, 1);
  });

  it("parses currency aliases", () => {
    assert.equal(parseCurrency({ text: "₽" }, "CNY"), "RUB");
    assert.equal(parseCurrency({ text: "юань" }, "RUB"), "CNY");
    assert.equal(parseCurrency({ text: "" }, "RUB"), "RUB");
    assert.equal(parseCurrency(undefined, "CNY"), "CNY");
  });

  it("parses price with separators and symbols", () => {
    assert.equal(parsePrice({ text: "1 234,50 ₽" }), 1234.5);
    assert.equal(parsePrice({ text: "450" }), 450);
    assert.equal(parsePrice({ text: "нет" }), 0);
    assert.equal(parsePrice(undefined), 0);
  });

  it("splits and normalizes sizes", () => {
    assert.deepEqual(splitSizes({ text: "41.0, 42;43\n40 40" }), [
      "40",
      "41",
      "42",
      "43",
    ]);
    assert.deepEqual(splitSizes({ text: "S, M, L" }), ["S", "M", "L"]);
    assert.deepEqual(splitSizes(undefined), []);
  });

  it("splits images, upgrades http and dedupes", () => {
    const urls = splitImages({
      text: "http://a.com/1.jpg, https://a.com/2.jpg not-a-url",
      hyperlink: "https://a.com/1.jpg",
    });
    assert.deepEqual(urls, ["https://a.com/1.jpg", "https://a.com/2.jpg"]);
  });

  it("normalizes image urls", () => {
    assert.equal(
      normalizeImageUrl("http://a.com/x.jpg"),
      "https://a.com/x.jpg",
    );
    assert.equal(normalizeImageUrl("ftp://a.com/x.jpg"), "");
    assert.equal(normalizeImageUrl("garbage"), "");
  });

  it("computes CNY prices with markup and RUB prices as final retail", () => {
    const cny = computeExcelPrices(100, "CNY", pricingCtx);
    assert.equal(cny.cny, 100);
    assert.equal(cny.rub, 1500);
    assert.equal(cny.usdt, 17.4);

    const rub = computeExcelPrices(1500, "RUB", pricingCtx);
    assert.equal(rub.rub, 1500);
    assert.equal(rub.cny, 125);
    assert.equal(rub.usdt, 17.3611);
  });

  it("resolves gender from cell and infers from name", () => {
    assert.equal(resolveExcelGender({ text: "мужской" }, "Кроссовки"), "male");
    assert.equal(resolveExcelGender({ text: "unisex" }, "Кроссовки"), null);
    assert.equal(
      resolveExcelGender(undefined, "Кроссовки мужские Nike"),
      "male",
    );
    assert.equal(resolveExcelGender(undefined, "Кроссовки Nike"), null);
  });

  it("maps a full row", () => {
    const result = mapExcelRowToUpsertRow(
      row({
        article: { text: "AB-1001" },
        name: { text: "Кроссовки беговые" },
        brand: { text: "Nike" },
        category: { text: "Кроссовки" },
        price: { text: "450" },
        currency: { text: "CNY" },
        sizes: { text: "40,41" },
        images: { text: "https://a.com/1.jpg" },
        gender: { text: "мужской" },
      }),
      mapCtx,
    );
    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    const r = result.row;
    assert.equal(r.poizon_id, "AB-1001");
    assert.equal(r.category_id, "cat-1");
    assert.equal(r.price_cny, 450);
    assert.equal(r.price_rub, 6750);
    assert.deepEqual(Object.keys(r.size_prices), ["40", "41"]);
    assert.deepEqual(r.sizes, { EU: ["40", "41"] });
    assert.deepEqual(r.stock, { "40": true, "41": true });
    assert.equal(r.gender, "male");
    assert.equal(r.is_available, true);
    assert.equal(r.sold_count, 0);
  });

  it("falls back name to brand + article", () => {
    const result = mapExcelRowToUpsertRow(
      row({
        article: { text: "X1" },
        brand: { text: "Adidas" },
        price: { text: "100" },
      }),
      mapCtx,
    );
    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    assert.equal(result.row.name, "Adidas X1");
    assert.deepEqual(result.row.sizes, {});
    assert.deepEqual(result.row.size_prices, {});
  });

  it("skips rows without article or price", () => {
    assert.deepEqual(
      mapExcelRowToUpsertRow(row({ price: { text: "100" } }), mapCtx),
      { status: "skipped", reason: "no_article" },
    );
    assert.deepEqual(
      mapExcelRowToUpsertRow(row({ article: { text: "A1" } }), mapCtx),
      { status: "skipped", reason: "no_price" },
    );
  });

  it("skips image-less rows only when requireImages", () => {
    const strict = { ...mapCtx, requireImages: true };
    assert.deepEqual(
      mapExcelRowToUpsertRow(
        row({
          article: { text: "A1" },
          name: { text: "Товар" },
          price: { text: "100" },
        }),
        strict,
      ),
      { status: "skipped", reason: "no_images" },
    );
  });

  it("keeps rows with embedded images when requireImages", () => {
    const strict = { ...mapCtx, requireImages: true };
    const result = mapExcelRowToUpsertRow(
      {
        ...row({
          article: { text: "A1" },
          name: { text: "Товар" },
          price: { text: "100" },
        }),
        embeddedImageCount: 2,
      },
      strict,
    );
    assert.equal(result.status, "mapped");
  });
});
