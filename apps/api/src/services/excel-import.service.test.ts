import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  ExcelImportError,
  parseExcelWorkbook,
} from "./excel-import.service.js";

async function buildWorkbook(
  headers: string[],
  rows: unknown[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Товары");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const RU_HEADERS = [
  "Артикул",
  "Название",
  "Бренд",
  "Категория",
  "Цена",
  "Валюта",
  "Размеры",
  "Фото",
  "Пол",
];

describe("excel-import parser", () => {
  it("parses rows, numeric cells and hyperlinks", async () => {
    const hyperlinkCell = {
      text: "фото",
      hyperlink: "https://example.com/img/ab-1002.jpg",
    };
    const buffer = await buildWorkbook(RU_HEADERS, [
      [
        "AB-1001",
        "Кроссовки беговые",
        "Nike",
        "Кроссовки",
        450,
        "CNY",
        "40,41,42",
        "https://example.com/img/ab-1001.jpg",
        "мужской",
      ],
      [
        "AB-1002",
        "Очки",
        "Gucci",
        "Очки",
        12500,
        "RUB",
        "",
        hyperlinkCell,
        "женский",
      ],
      ["", "Без артикула", "", "", 100, "CNY", "", "", ""],
    ]);

    const { rows } = await parseExcelWorkbook(buffer);
    assert.equal(rows.length, 3);

    const [first, second, third] = rows;
    assert.equal(first.rowNum, 2);
    assert.equal(first.fields.article?.text, "AB-1001");
    assert.equal(first.fields.price?.text, "450");
    assert.equal(first.fields.sizes?.text, "40,41,42");
    assert.equal(second.fields.images?.hyperlink, hyperlinkCell.hyperlink);
    assert.equal(third.fields.article?.text, "");
    assert.equal(third.fields.name?.text, "Без артикула");
  });

  it("throws HEADERS_UNRECOGNIZED with found headers", async () => {
    const buffer = await buildWorkbook(
      ["Foo", "Bar", "Baz"],
      [["a", "b", "c"]],
    );
    await assert.rejects(
      parseExcelWorkbook(buffer),
      (err: unknown) =>
        err instanceof ExcelImportError &&
        err.code === "HEADERS_UNRECOGNIZED" &&
        err.details.includes("Foo"),
    );
  });

  it("throws EMPTY_FILE when no data rows", async () => {
    const buffer = await buildWorkbook(RU_HEADERS, []);
    await assert.rejects(
      parseExcelWorkbook(buffer),
      (err: unknown) =>
        err instanceof ExcelImportError && err.code === "EMPTY_FILE",
    );
  });

  it("throws FILE_CORRUPT on non-xlsx buffer", async () => {
    await assert.rejects(
      parseExcelWorkbook(Buffer.from("это точно не xlsx")),
      (err: unknown) =>
        err instanceof ExcelImportError && err.code === "FILE_CORRUPT",
    );
  });

  it("accepts custom aliases via overrides", async () => {
    const buffer = await buildWorkbook(
      ["Номер", "Наименование", "Прайс"],
      [["A-1", "Товар", 100]],
    );
    const { rows } = await parseExcelWorkbook(buffer, {
      article: ["номер"],
      price: ["прайс"],
    });
    assert.equal(rows[0]?.fields.article?.text, "A-1");
    assert.equal(rows[0]?.fields.price?.text, "100");
  });
});
