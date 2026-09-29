/**
 * Генерация шаблона Excel для импорта товаров (отдаётся заказчику).
 *
 * Использование:
 *   npx tsx scripts/generate-excel-template.ts
 * Результат: docs/excel-import-template.xlsx в корне репозитория.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const HEADERS = [
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

const SAMPLE_ROWS: (string | number)[][] = [
  [
    "AB-1001",
    "Кроссовки беговые",
    "Nike",
    "Кроссовки",
    450,
    "CNY",
    "40,41,42,43",
    "https://example.com/img/ab1001-1.jpg https://example.com/img/ab1001-2.jpg",
    "мужской",
  ],
  [
    "AB-1002",
    "Очки солнцезащитные",
    "Gucci",
    "Очки",
    12500,
    "RUB",
    "",
    "https://example.com/img/ab1002.jpg",
    "женский",
  ],
];

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Товары");
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  for (const row of SAMPLE_ROWS) sheet.addRow(row);
  for (const col of sheet.columns) {
    col.width = 20;
  }

  const outPath = fileURLToPath(
    new URL("../../../docs/excel-import-template.xlsx", import.meta.url),
  );
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  writeFileSync(outPath, buffer);
  console.log(`[excel-template] Шаблон записан: ${outPath}`);
}

main().catch((e) => {
  console.error("[excel-template] Ошибка:", e);
  process.exit(1);
});
