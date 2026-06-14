import { readFileSync } from "node:fs";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import {
  type PoparceRawProduct,
  runBulkImport,
} from "../src/services/poizon-sync.service.js";

loadDotEnv();

const filePath = process.argv[2];

if (!filePath) {
  console.error(
    "Использование: npx tsx scripts/bulk-import.ts <путь-к-json-файлу>",
  );
  process.exit(1);
}

let raw: unknown;
try {
  const content = readFileSync(filePath, "utf-8");
  raw = JSON.parse(content);
} catch (e) {
  console.error("Ошибка чтения JSON-файла:", (e as Error).message);
  process.exit(1);
}

// Поддерживаем как массив, так и объект с полем-массивом
let products: PoparceRawProduct[];
if (Array.isArray(raw)) {
  products = raw as PoparceRawProduct[];
} else if (
  raw &&
  typeof raw === "object" &&
  "spuList" in raw &&
  Array.isArray((raw as Record<string, unknown>).spuList)
) {
  products = (raw as { spuList: PoparceRawProduct[] }).spuList;
} else if (
  raw &&
  typeof raw === "object" &&
  "productList" in raw &&
  Array.isArray((raw as Record<string, unknown>).productList)
) {
  products = (raw as { productList: PoparceRawProduct[] }).productList;
} else if (
  raw &&
  typeof raw === "object" &&
  "data" in raw &&
  Array.isArray((raw as Record<string, unknown>).data)
) {
  products = (raw as { data: PoparceRawProduct[] }).data;
} else {
  console.error(
    "Неизвестный формат JSON. Ожидается массив товаров или объект с полем spuList/productList/data.",
  );
  process.exit(1);
}

console.log(`Найдено ${products.length} товаров в файле. Начинаем импорт...`);

const result = await runBulkImport(products);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
