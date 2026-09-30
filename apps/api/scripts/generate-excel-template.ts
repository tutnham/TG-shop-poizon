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

const MIN_COLUMN_WIDTHS = [12, 20, 12, 14, 8, 8, 14, 40, 10];

const SAMPLE_ROW = [
  "ОБРАЗЕЦ",
  "Пример товара (эту строку можно удалить — она не импортируется, т.к. без цены)",
  "Бренд",
  "Кроссовки",
  "",
  "CNY",
  "40,41,42,43",
  "Вставьте фото в эту строку или впишите ссылки через пробел",
  "мужской",
];

const INSTRUCTIONS: string[] = [
  "ИНСТРУКЦИЯ ПО ЗАПОЛНЕНИЮ ТАБЛИЦЫ",
  "",
  "1. Одна строка листа «Товары» = один товар.",
  "2. Обязательные колонки: АРТИКУЛ и ЦЕНА. Без них товар не добавится.",
  "3. Артикул — уникальный код товара. Если товар с таким артикулом уже есть в магазине, он обновится.",
  "4. Цена — число. Валюта: CNY (юани, цена пересчитается с наценкой) или RUB (рубли, итоговая розничная цена).",
  "5. Размеры/Параметры — в одной ячейке через запятую. Сюда вписываются ЛЮБЫЕ варианты или характеристики товара:",
  "   • Обувь: 40,41,42,43 (европейские размеры)",
  "   • Одежда: S,M,L,XL или 44,46,48,50",
  "   • Очки: 52-18-140 (линза-мост-дужка) или один размер",
  "   • Техника: 64GB,128GB,256GB (память) или Black,White,Blue (цвет)",
  "   • Ювелирка: 16,17,18 (размер кольца) или 40cm,45cm,50cm (длина цепочки)",
  "   • Часы: 38mm,40mm,42mm (диаметр корпуса)",
  "   • Аксессуары: один размер, универсальный или оставьте пустым",
  "   Если у товара нет вариантов — оставьте пустым или впишите одну характеристику.",
  "6. Пол — мужской / женский / unisex (или оставьте пустым).",
  "7. Категория — например: Кроссовки, Очки, Одежда, Техника, Ювелирка. Новая категория создастся автоматически.",
  "",
  "ФОТОГРАФИИ — два способа:",
  "• Вставить картинкой: «Вставка → Рисунки → Поместить НАД ячейками» и расположить фото",
  "  напротив строки своего товара (в колонке «Фото»). До 8 фото на товар.",
  "  Важно: НЕ используйте вариант «Поместить В ячейку» — такие фото не распознаются.",
  "• Или ссылками: вписать в колонку «Фото» адреса картинок через пробел или запятую.",
  "",
  "ЛИМИТЫ ФАЙЛА: не более 8 МБ и не более 2000 товаров в одном файле.",
  "Готовый файл отправьте в Telegram-бот (чат админ-бота, просто пришлите файл .xlsx).",
  "Бот пришлёт отчёт: сколько товаров создано, обновлено и пропущено.",
  "",
  "Первую строку (заголовки колонок) не удалять и не переименовывать!",
  "Строку-образец можно удалить или перезаписать своим товаром.",
];

function styleProductsSheet(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.height = 24;
  for (let col = 1; col <= HEADERS.length; col++) {
    const cell = header.getCell(col);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F5496" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = { bottom: { style: "thin" } };
  }
  // Обязательные колонки подсвечиваем
  for (const col of [1, 5]) {
    header.getCell(col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFC00000" },
    };
  }

  // Устанавливаем минимальные ширины
  HEADERS.forEach((_, i) => {
    sheet.getColumn(i + 1).width = MIN_COLUMN_WIDTHS[i];
  });

  sheet.addRow(SAMPLE_ROW);
  sheet.getRow(2).font = { italic: true, color: { argb: "FF808080" } };
  sheet.getRow(2).height = 30;
  sheet.getRow(2).alignment = { wrapText: true, vertical: "top" };

  // Автоподбор ширины колонок (как Cells.EntireColumn.AutoFit в VBA)
  autoFitColumns(sheet);
}

/**
 * Автоподбор ширины колонок на основе содержимого ячеек.
 * Аналог Cells.EntireColumn.AutoFit в VBA.
 */
function autoFitColumns(sheet: ExcelJS.Worksheet): void {
  for (let col = 1; col <= sheet.columnCount; col++) {
    let maxWidth = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cell = row.getCell(col);
      const text = cell.text || "";
      // Учитываем переносы строк
      const lines = text.split("\n");
      const maxLineLength = Math.max(...lines.map((l) => l.length));
      if (maxLineLength > maxWidth) maxWidth = maxLineLength;
    });
    // Добавляем небольшой отступ, ограничиваем максимумом
    const minWidth = MIN_COLUMN_WIDTHS[col - 1] || 8;
    sheet.getColumn(col).width = Math.min(Math.max(maxWidth + 2, minWidth), 60);
  }
}

function styleInstructionsSheet(sheet: ExcelJS.Worksheet): void {
  sheet.getColumn(1).width = 110;
  for (const [i, line] of INSTRUCTIONS.entries()) {
    const row = sheet.addRow([line]);
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    if (i === 0) {
      row.getCell(1).font = { bold: true, size: 14 };
    } else if (
      line &&
      !line.startsWith(" ") &&
      line === line.toUpperCase() &&
      line.length > 10
    ) {
      row.getCell(1).font = { bold: true, size: 12 };
    }
  }
}

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  const products = workbook.addWorksheet("Товары");
  products.addRow(HEADERS);
  styleProductsSheet(products);

  const instructions = workbook.addWorksheet("Инструкция");
  styleInstructionsSheet(instructions);

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
