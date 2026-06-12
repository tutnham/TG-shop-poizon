/**
 * Импорт товаров из pop2.json (выгрузка с thepoizon.ru).
 *
 * Формат pop2.json:
 *   { categories: [...], brands: [...], products: [...] }
 *
 * Использование:
 *   npx tsx scripts/import-pop2.ts ../../pop2.json
 */
import { readFileSync } from "node:fs";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { refreshRates } from "../src/services/currency.service.js";
import { getPricingConfig } from "../src/services/pricing.service.js";

loadDotEnv();

// ── Константы ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const UPSERT_DELAY_MS = 250; // задержка между товарами
const MAX_RETRIES = 5;

// ── Прямой fetch к Supabase REST API ───────────────────────────────

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

/** Выполнить fetch с таймаутом и контролем соединения */
async function safeFetch(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Отключаем keep-alive чтобы избежать проблем с переиспользованием соединений
    const headers = new Headers(init.headers);
    headers.set("Connection", "close");
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
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

async function supabaseInsert(table: string, row: Record<string, unknown>): Promise<void> {
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

async function supabaseUpsert(table: string, row: Record<string, unknown>, onConflict: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const headers = { ...supabaseHeaders(), Prefer: "resolution=merge-duplicates" };
  const res = await safeFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`UPSERT ${table}: ${res.status} - ${text.slice(0, 200)}`);
  }
}

// ── Типы для pop2.json ──────────────────────────────────────────────

interface Pop2Category {
  id: number;
  name: string;
  parentId?: number;
  rootId?: number;
}

interface Pop2Brand {
  id: number;
  name: string;
  logoUrl?: string;
}

interface Pop2Property {
  key: string;
  value: string;
}

interface Pop2Product {
  productId: number;
  variantId: string;
  url: string;
  title: string;
  description: string;
  vendorCode: string;
  categoryId: number;
  vendorId: number;
  images: string[];
  price: number;
  favoriteCount: number;
  countryOfOrigin: string;
  properties: Pop2Property[];
  seriesName: string;
  relatedProducts: number[];
  gender: string;
  sizes: string[];
  vat: string;
  currency: string;
  keywords: string[];
  vendor: string;
}

interface Pop2Data {
  categories: Pop2Category[];
  brands: Pop2Brand[];
  products: Pop2Product[];
}

// ── Кеш категорий (poizon_id → UUID) ───────────────────────────────

const categoryCache = new Map<number, string>();

async function ensureCategories(categories: Pop2Category[]): Promise<void> {
  console.log(`[import-pop2] Обрабатываем ${categories.length} категорий...`);

  for (const cat of categories) {
    // Проверяем, есть ли уже категория с таким poizon_id
    const existing = await supabaseGet(
      `categories?select=id&poizon_id=eq.${cat.id}`,
    ) as { id: string }[] | null;

    if (existing && existing.length > 0) {
      categoryCache.set(cat.id, existing[0].id);
      continue;
    }

    // Формируем slug из имени
    const slug = cat.name
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Ищем родительскую категорию
    let parentId: string | null = null;
    if (cat.parentId && cat.parentId !== cat.id && cat.parentId !== cat.rootId) {
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
      const created = await supabaseGet(
        `categories?select=id&poizon_id=eq.${cat.id}`,
      ) as { id: string }[] | null;
      if (created && created.length > 0) {
        categoryCache.set(cat.id, created[0].id);
      }
    } catch (e) {
      console.warn(`[import-pop2] Ошибка создания категории "${cat.name}":`, (e as Error).message);
    }
  }

  console.log(`[import-pop2] Категорий в кеше: ${categoryCache.size}`);
}

// ── Формирование имени товара ───────────────────────────────────────

function buildProductName(p: Pop2Product): string {
  // Если есть title — используем его
  if (p.title && p.title.trim()) return p.title.trim();

  // Иначе: серия + артикул
  const parts: string[] = [];
  if (p.seriesName && p.seriesName.trim()) {
    parts.push(p.seriesName.trim());
  }
  if (p.vendorCode && p.vendorCode.trim()) {
    parts.push(p.vendorCode.trim());
  }
  if (parts.length > 0) return parts.join(" ");

  // Совсем запасной вариант
  return `${p.vendor || "Unknown"} #${p.productId}`;
}

// ── Основная функция импорта ────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error("Использование: npx tsx scripts/import-pop2.ts <путь-к-pop2.json>");
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
  const config = await getPricingConfig({ skipRatesRefresh: true });
  const rateCnyRub = config.rate_cny_rub;   // сколько RUB за 1 CNY
  const rateCnyUsd = config.rate_cny_usd;   // сколько USD за 1 CNY (≈ кросс-курс)
  console.log(`[import-pop2] Курсы: CNY→RUB=${rateCnyRub}, CNY→USD=${rateCnyUsd}`);

  // Нормализуем товары
  const batch: Array<{
    poizon_id: string;
    name: string;
    brand: string | null;
    category_id: string | null;
    image_urls: string[];
    price_cny: number;
    price_rub: number;
    price_usdt: number;
    sizes: Record<string, string[]>;
    stock: Record<string, boolean>;
    sold_count: number;
    is_available: boolean;
  }> = [];
  let skippedNoPrice = 0;
  let skippedNoImages = 0;

  for (const p of data.products) {
    // Пропускаем товары без цены
    if (!p.price || p.price <= 0) {
      skippedNoPrice++;
      continue;
    }

    // Пропускаем товары без картинок
    if (!p.images || p.images.length === 0) {
      skippedNoImages++;
      continue;
    }

    const name = buildProductName(p);

    // Цена в pop2.json уже в RUB, пересчитываем в CNY и USDT
    const priceRub = p.price;
    const priceCny = Math.round((priceRub / rateCnyRub) * 100) / 100;
    const priceUsdt = Math.round((priceCny / rateCnyUsd) * 10000) / 10000;

    // Категория
    const categoryId = categoryCache.get(p.categoryId) ?? null;

    batch.push({
      poizon_id: String(p.productId),
      name,
      brand: p.vendor || null,
      category_id: categoryId,
      image_urls: p.images,
      price_cny: priceCny,
      price_rub: priceRub,
      price_usdt: priceUsdt,
      sizes: p.sizes && p.sizes.length > 0 ? { EU: p.sizes } : {},
      stock: p.sizes && p.sizes.length > 0 ? Object.fromEntries(p.sizes.map((s) => [s, true])) : {},
      sold_count: p.favoriteCount || 0,
      is_available: p.price > 0,
    });
  }

  console.log(
    `[import-pop2] Товаров к импорту: ${batch.length}` +
    ` (пропущено: без цены=${skippedNoPrice}, без картинок=${skippedNoImages})`,
  );

  if (batch.length === 0) {
    console.log("[import-pop2] Нет товаров для импорта");
    process.exit(0);
  }

  // Поштучный upsert с повторными попытками
  let totalInserted = 0;
  let totalErrors = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < batch.length; i++) {
    const product = batch[i];
    let inserted = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await supabaseUpsert("products", {
          poizon_id: product.poizon_id,
          name: product.name,
          brand: product.brand,
          category_id: product.category_id,
          image_urls: product.image_urls,
          price_cny: product.price_cny,
          price_rub: product.price_rub,
          price_usdt: product.price_usdt,
          sizes: product.sizes,
          stock: product.stock,
          sold_count: product.sold_count,
          is_available: product.is_available,
          source: "poizon",
          synced_at: now,
          updated_at: now,
        }, "poizon_id");

        inserted = true;
        break;
      } catch (e) {
        const err = e as Error & { cause?: Error };
        const detail = err.cause?.message ?? err.message;
        const msg = detail.length > 150 ? detail.slice(0, 150) + "..." : detail;
        if (attempt < MAX_RETRIES) {
          const waitMs = 1000 * attempt;
          console.warn(
            `[import-pop2] Товар ${product.poizon_id} попытка ${attempt}/${MAX_RETRIES}: ${msg}, ждём ${waitMs}мс...`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
        } else {
          console.error(
            `[import-pop2] Товар ${product.poizon_id}: НЕУДАЧА после ${MAX_RETRIES} попыток: ${msg}`,
          );
        }
      }
    }

    if (inserted) {
      totalInserted++;
    } else {
      totalErrors++;
    }

    if ((i + 1) % 50 === 0 || i === batch.length - 1) {
      console.log(
        `[import-pop2] Прогресс: ${i + 1}/${batch.length} | ` +
        `вставлено=${totalInserted}, ошибок=${totalErrors}`,
      );
    }

    // Задержка между товарами для соблюдения rate-limit
    if (i < batch.length - 1) {
      await new Promise((r) => setTimeout(r, UPSERT_DELAY_MS));
    }
  }

  console.log(`\n[import-pop2] Импорт завершён!`);
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
