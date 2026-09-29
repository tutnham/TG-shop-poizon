/**
 * Импорт товаров из Excel (.xlsx) — локальный аналог импорта через админ-бота.
 *
 * Использование:
 *   npx tsx scripts/import-excel.ts <путь-к-файлу.xlsx>
 */
import { readFileSync } from "node:fs";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { importProductsFromExcel } from "../src/services/excel-import.service.js";

loadDotEnv();

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Использование: npx tsx scripts/import-excel.ts <файл.xlsx>");
    process.exit(1);
  }

  const buffer = readFileSync(filePath);
  const stats = await importProductsFromExcel(buffer);

  console.log("\n[import-excel] Готово:");
  console.log(`  Всего строк: ${stats.parsed}`);
  console.log(`  Создано: ${stats.created}`);
  console.log(`  Обновлено: ${stats.updated}`);
  console.log(`  Пропущено: ${stats.skipped}`);
  console.log(`  Дубликаты артикулов: ${stats.duplicates}`);
  console.log(`  Ошибки записи: ${stats.errors}`);
  for (const skip of stats.skipDetails.slice(0, 20)) {
    console.log(
      `  - строка ${skip.rowNum} (${skip.article ?? "?"}): ${skip.reason}`,
    );
  }
}

main().catch((e) => {
  console.error("[import-excel] Критическая ошибка:", e);
  process.exit(1);
});
