import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { extractEmbeddedImages } from "./excel-images.service.js";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function roundTrip(build: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  return loaded;
}

describe("extractEmbeddedImages", () => {
  it("maps images to rows by anchor and sorts by column", async () => {
    const loaded = await roundTrip((wb) => {
      const sheet = wb.addWorksheet("Товары");
      sheet.addRow(["Артикул", "Фото"]);
      sheet.addRow(["A-1"]);
      sheet.addRow(["A-2"]);
      const img = wb.addImage({ buffer: PNG_1PX, extension: "png" });
      sheet.addImage(img, {
        tl: { col: 7.2, row: 1.5 },
        ext: { width: 40, height: 40 },
        editAs: "oneCell",
      });
      sheet.addImage(img, {
        tl: { col: 1.1, row: 1.2 },
        ext: { width: 40, height: 40 },
        editAs: "oneCell",
      });
      sheet.addImage(img, {
        tl: { col: 0.5, row: 2.4 },
        ext: { width: 40, height: 40 },
        editAs: "oneCell",
      });
    });

    const sheet = loaded.worksheets[0];
    const byRow = extractEmbeddedImages(loaded, sheet);

    assert.equal(byRow.size, 2);
    const row2 = byRow.get(2);
    assert.equal(row2?.length, 2);
    assert.equal(row2?.[0].extension, "png");
    assert.ok(row2[0].buffer.length > 0);
    assert.equal(byRow.get(3)?.length, 1);
  });

  it("ignores images anchored to the header row", async () => {
    const loaded = await roundTrip((wb) => {
      const sheet = wb.addWorksheet("Товары");
      sheet.addRow(["Артикул"]);
      sheet.addRow(["A-1"]);
      const img = wb.addImage({ buffer: PNG_1PX, extension: "png" });
      sheet.addImage(img, {
        tl: { col: 0, row: 0.2 },
        ext: { width: 10, height: 10 },
        editAs: "oneCell",
      });
    });
    const byRow = extractEmbeddedImages(loaded, loaded.worksheets[0]);
    assert.equal(byRow.size, 0);
  });

  it("returns empty map for workbook without images", async () => {
    const loaded = await roundTrip((wb) => {
      const sheet = wb.addWorksheet("Товары");
      sheet.addRow(["Артикул"]);
      sheet.addRow(["A-1"]);
    });
    const byRow = extractEmbeddedImages(loaded, loaded.worksheets[0]);
    assert.equal(byRow.size, 0);
  });
});
