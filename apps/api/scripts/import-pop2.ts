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
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { refreshRates } from "../src/services/currency.service.js";
import {
  minSizePrice,
  type SizePricesMap,
} from "../src/services/product-pricing.js";
import { stripCjk } from "../src/services/poizon-sku.mapper.js";
import { loadShopPricingSettings } from "../src/services/pricing.service.js";

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

async function supabaseUpsert(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const headers = {
    ...supabaseHeaders(),
    Prefer: "resolution=merge-duplicates",
  };
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

interface Pop2Child {
  params?: Pop2Property[];
  price?: number;
  purchasePrice?: number;
  available?: boolean;
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
  children?: Pop2Child[];
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
    const existing = (await supabaseGet(
      `categories?select=id&poizon_id=eq.${cat.id}`,
    )) as { id: string }[] | null;

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

// ── Формирование имени товара ───────────────────────────────────────

function buildProductName(p: Pop2Product): string {
  if (p.title?.trim()) {
    const cleaned = stripCjk(p.title.trim());
    if (cleaned) return cleaned;
  }

  const parts = [p.vendor, p.seriesName, p.vendorCode]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  if (parts.length > 0) return parts.join(" ");

  return `${p.vendor || "Unknown"} #${p.productId}`;
}

/** pop2.json: children[].params[key=Размер].value → size label */
function extractSizeLabel(params: Pop2Property[] | undefined): string | null {
  if (!params?.length) return null;
  const sizeParam = params.find((param) => /размер|size/i.test(param.key));
  const value = sizeParam?.value?.trim();
  return value || null;
}

function rubToSizePrice(
  priceRub: number,
  rateCnyRub: number,
  rateCnyUsd: number,
): { cny: number; rub: number; usdt: number } {
  const priceCny = Math.round((priceRub / rateCnyRub) * 100) / 100;
  const priceUsdt = Math.round((priceCny / rateCnyUsd) * 10000) / 10000;
  return { rub: priceRub, cny: priceCny, usdt: priceUsdt };
}

/** pop2.json: children[].price / purchasePrice (RUB) → size_prices, sizes, stock */
function buildVariantPricing(
  product: Pop2Product,
  rateCnyRub: number,
  rateCnyUsd: number,
): {
  size_prices: SizePricesMap;
  sizes: string[];
  stock: Record<string, boolean>;
} {
  const sizePrices: SizePricesMap = {};
  const stock: Record<string, boolean> = {};

  for (const child of product.children ?? []) {
    const size = extractSizeLabel(child.params);
    if (!size) continue;

    const priceRub = child.price || child.purchasePrice || 0;
    if (priceRub <= 0) continue;

    const prices = rubToSizePrice(priceRub, rateCnyRub, rateCnyUsd);
    const existing = sizePrices[size];
    if (!existing || prices.rub < existing.rub) {
      sizePrices[size] = prices;
    }
    stock[size] = child.available !== false;
  }

  const sizes = Object.keys(sizePrices).sort((a, b) => {
    const na = Number.parseFloat(a.replace(",", "."));
    const nb = Number.parseFloat(b.replace(",", "."));
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.localeCompare(b, "ru");
  });

  return { size_prices: sizePrices, sizes, stock };
}

// ── Основная функция импорта ────────────────────────────────────────

async function main() {
  const filePath =
    process.argv[2] ??
    fileURLToPath(new URL("../../../pop2.json", import.meta.url));

  if (!filePath) {
    console.error(
      "Использование: npx tsx scripts/import-pop2.ts [путь-к-pop2.json]",
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
  const batch: Array<{
    poizon_id: string;
    name: string;
    brand: string | null;
    category_id: string | null;
    image_urls: string[];
    price_cny: number;
    price_rub: number;
    price_usdt: number;
    size_prices: SizePricesMap;
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
    const variantPricing = buildVariantPricing(p, rateCnyRub, rateCnyUsd);
    const scalarFromSizes = minSizePrice(variantPricing.size_prices);

    // pop2.json: price (RUB) → price_rub; min(children[].price) если есть размерные цены
    const priceRub = scalarFromSizes?.rub ?? p.price;
    const priceCny =
      scalarFromSizes?.cny ??
      Math.round((priceRub / rateCnyRub) * 100) / 100;
    const priceUsdt =
      scalarFromSizes?.usdt ??
      Math.round((priceCny / rateCnyUsd) * 10000) / 10000;

    const sizeLabels =
      variantPricing.sizes.length > 0
        ? variantPricing.sizes
        : p.sizes && p.sizes.length > 0
          ? p.sizes
          : [];

    const stock =
      variantPricing.sizes.length > 0
        ? variantPricing.stock
        : sizeLabels.length > 0
          ? Object.fromEntries(sizeLabels.map((s) => [s, true]))
          : {};

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
      size_prices: variantPricing.size_prices,
      sizes: sizeLabels.length > 0 ? { EU: sizeLabels } : {},
      stock,
      sold_count: p.favoriteCount || 0,
      is_available: priceRub > 0,
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
        await supabaseUpsert(
          "products",
          {
            poizon_id: product.poizon_id,
            name: product.name,
            brand: product.brand,
            category_id: product.category_id,
            image_urls: product.image_urls,
            price_cny: product.price_cny,
            price_rub: product.price_rub,
            price_usdt: product.price_usdt,
            size_prices: product.size_prices,
            sizes: product.sizes,
            stock: product.stock,
            sold_count: product.sold_count,
            is_available: product.is_available,
            source: "poizon",
            synced_at: now,
            updated_at: now,
          },
          "poizon_id",
        );

        inserted = true;
        break;
      } catch (e) {
        const err = e as Error & { cause?: Error };
        const detail = err.cause?.message ?? err.message;
        const msg = detail.length > 150 ? `${detail.slice(0, 150)}...` : detail;
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
