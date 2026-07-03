/**
 * Импорт товаров из Export3.json / pop2.json (выгрузка с thepoizon.ru).
 *
 * Формат pop2.json:
 *   { categories: [...], brands: [...], products: [...] }
 *
 * Использование:
 *   npx tsx scripts/import-pop2.ts ../../../Export3.json
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { upsertProductsBatch } from "../src/db/product.repository.js";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { refreshRates } from "../src/services/currency.service.js";
import {
  type Export3UpsertRow,
  type Pop2Category,
  type Pop2Data,
  createCategorySlug,
  mapExport3ProductToUpsertRow,
} from "../src/services/export3-import.mapper.js";
import { loadShopPricingSettings } from "../src/services/pricing.service.js";

loadDotEnv();

// ── Константы ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ── Прямой fetch к Supabase REST API ───────────────────────────────

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

/** Выполнить fetch с таймаутом и контролем соединения */
async function safeFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Отключаем keep-alive чтобы избежать проблем с переиспользованием соединений
    const headers = new Headers(init.headers);
    headers.set("Connection", "close");
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseGet(path: string): Promise<unknown> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await safeFetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function supabaseInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await safeFetch(url, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`INSERT ${table}: ${res.status} - ${text.slice(0, 200)}`);
  }
}

// ── Кеш категорий (poizon_id → UUID) ───────────────────────────────

const categoryCache = new Map<number, string>();

async function ensureCategories(categories: Pop2Category[]): Promise<void> {
  console.log(`[import-pop2] Обрабатываем ${categories.length} категорий...`);

  for (const cat of categories) {
    // Проверяем, есть ли уже категория с таким poizon_id
    const existing = (await supabaseGet(
      `categories?select=id&poizon_id=eq.${cat.id}`,
    )) as { id: string }[] | null;

    if (existing && existing.length > 0) {
      categoryCache.set(cat.id, existing[0].id);
      continue;
    }

    // Формируем slug из имени
    const slug = createCategorySlug(cat.name);

    // Ищем родительскую категорию
    let parentId: string | null = null;
    if (
      cat.parentId &&
      cat.parentId !== cat.id &&
      cat.parentId !== cat.rootId
    ) {
      parentId = categoryCache.get(cat.parentId) ?? null;
    }

    try {
      await supabaseInsert("categories", {
        name: cat.name,
        name_ru: cat.name,
        slug,
        parent_id: parentId,
        poizon_id: String(cat.id),
      });
      // Получаем id созданной категории
      const created = (await supabaseGet(
        `categories?select=id&poizon_id=eq.${cat.id}`,
      )) as { id: string }[] | null;
      if (created && created.length > 0) {
        categoryCache.set(cat.id, created[0].id);
      }
    } catch (e) {
      console.warn(
        `[import-pop2] Ошибка создания категории "${cat.name}":`,
        (e as Error).message,
      );
    }
  }

  console.log(`[import-pop2] Категорий в кеше: ${categoryCache.size}`);
}

// ── Основная функция импорта ────────────────────────────────────────

async function main() {
  const filePath =
    process.argv[2] ??
    fileURLToPath(new URL("../../../Export3.json", import.meta.url));

  if (!filePath) {
    console.error(
      "Использование: npx tsx scripts/import-pop2.ts [путь-к-Export3.json]",
    );
    process.exit(1);
  }

  // Читаем JSON
  let data: Pop2Data;
  try {
    const content = readFileSync(filePath, "utf-8");
    data = JSON.parse(content);
  } catch (e) {
    console.error("Ошибка чтения JSON-файла:", (e as Error).message);
    process.exit(1);
  }

  if (!data.products || !Array.isArray(data.products)) {
    console.error("Файл не содержит поля products с массивом товаров");
    process.exit(1);
  }

  console.log(`[import-pop2] Найдено ${data.products.length} товаров`);

  // Создаём категории
  if (data.categories && data.categories.length > 0) {
    await ensureCategories(data.categories);
  }

  // Получаем курсы валют и конфиг цен
  console.log("[import-pop2] Получаем курсы валют...");
  await refreshRates(true);
  const config = await loadShopPricingSettings();
  const rateCnyRub = config.rate_cny_rub; // сколько RUB за 1 CNY
  const rateCnyUsd = config.rate_cny_usd; // сколько USD за 1 CNY (≈ кросс-курс)
  console.log(
    `[import-pop2] Курсы: CNY→RUB=${rateCnyRub}, CNY→USD=${rateCnyUsd}`,
  );

  // Нормализуем товары
  const batch: Export3UpsertRow[] = [];
  let skippedNoPrice = 0;
  let skippedNoImages = 0;

  for (const p of data.products) {
    const mapped = mapExport3ProductToUpsertRow(p, {
      categoryCache,
      rateCnyRub,
      rateCnyUsd,
    });

    if (mapped.status === "skipped") {
      if (mapped.reason === "no_images") skippedNoImages++;
      if (mapped.reason === "no_price") skippedNoPrice++;
      continue;
    }

    batch.push(mapped.row);
  }

  console.log(
    `[import-pop2] Товаров к импорту: ${batch.length}` +
      ` (пропущено: без цены=${skippedNoPrice}, без картинок=${skippedNoImages})`,
  );

  if (batch.length === 0) {
    console.log("[import-pop2] Нет товаров для импорта");
    process.exit(0);
  }

  const { inserted: totalInserted, errors: totalErrors } =
    await upsertProductsBatch(batch);

  console.log("\n[import-pop2] Импорт завершён!");
  console.log(`  Всего в файле: ${data.products.length}`);
  console.log(`  Импортировано: ${totalInserted}`);
  console.log(`  Ошибок: ${totalErrors}`);
  console.log(`  Пропущено (без цены): ${skippedNoPrice}`);
  console.log(`  Пропущено (без картинок): ${skippedNoImages}`);
}

main().catch((e) => {
  console.error("Критическая ошибка:", e);
  process.exit(1);
});
