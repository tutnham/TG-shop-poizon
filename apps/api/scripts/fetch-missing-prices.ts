/**
 * Добор цен для товаров без цены из pop2.json через Poizon API.
 *
 * Алгоритм (v2 — старые spuId удалены, ищем по vendorCode):
 * 1. Читаем pop2.json, находим товары с price=0
 * 2. Для каждого ищем через /searchProducts по vendorCode (и seriesName если не нашлось)
 * 3. Для найденного spuId дёргаем /productDetail → authPrice
 * 4. Обновляем цену, название, poizon_id в БД
 *
 * Использование:
 *   npx tsx scripts/fetch-missing-prices.ts ../../pop2.json
 */
import { readFileSync } from "node:fs";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { refreshRates } from "../src/services/currency.service.js";
import { loadShopPricingSettings } from "../src/services/pricing.service.js";

loadDotEnv();

// ── Конфигурация API ───────────────────────────────────────────────

const POIZON_API_KEY =
  process.env.POIZON_OFFICIAL_API_KEY || process.env.POIZON_API_KEY || "";
const POIZON_API_URL =
  process.env.POIZON_OFFICIAL_API_URL ||
  process.env.POIZON_API_BASE_URL ||
  "https://poizon-api.com/api/dewu";

if (!POIZON_API_KEY) {
  console.error("Ошибка: POIZON_OFFICIAL_API_KEY не задан в .env");
  process.exit(1);
}

// ── Supabase REST ───────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function safeFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("Connection", "close");
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
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

// ── Poizon API: поиск по vendorCode / seriesName ────────────────────

interface SearchResultItem {
  spuId: number;
  title: string;
  logoUrl: string;
  images: string[];
  articleNumber: string;
}

async function searchProduct(
  keyword: string,
): Promise<SearchResultItem | null> {
  const url = `${POIZON_API_URL}/searchProducts?keyword=${encodeURIComponent(keyword)}&limit=3&page=0`;
  const res = await safeFetch(url, {
    headers: {
      "x-api-key": POIZON_API_KEY,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    if (res.status === 429) return null;
    return null;
  }
  const data = (await res.json()) as {
    total: number;
    productList: SearchResultItem[];
  };
  return data.productList?.[0] ?? null;
}

// ── Poizon API: детали товара (authPrice) ───────────────────────────

interface ProductDetailData {
  detail: {
    spuId: number;
    title: string;
    logoUrl: string;
    authPrice: number;
    status: number;
  };
  image?: { spuImage?: { images?: Array<{ url: string }> } };
}

async function fetchProductDetail(
  spuId: number,
): Promise<ProductDetailData | null> {
  const url = `${POIZON_API_URL}/productDetail?spuId=${spuId}`;
  const res = await safeFetch(url, {
    headers: {
      "x-api-key": POIZON_API_KEY,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as ProductDetailData;
}

// ── Типы pop2.json ──────────────────────────────────────────────────

interface Pop2Product {
  productId: number;
  title: string;
  vendorCode: string;
  seriesName: string;
  images: string[];
  price: number;
  vendor: string;
  categoryId: number;
  favoriteCount: number;
  url: string;
  currency: string;
}

interface Pop2Data {
  products: Pop2Product[];
}

// ── Основная функция ────────────────────────────────────────────────

const DELAY_MS = 1500; // задержка между запросами к API

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      "Использование: npx tsx scripts/fetch-missing-prices.ts <путь-к-pop2.json>",
    );
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf-8");
  const data = JSON.parse(content) as Pop2Data;

  const noPrice = data.products.filter((p) => !p.price || p.price <= 0);
  console.log(`[fetch-prices] Товаров без цены: ${noPrice.length}`);

  if (noPrice.length === 0) {
    console.log("[fetch-prices] Все товары имеют цену, нечего делать.");
    process.exit(0);
  }

  // Получаем курсы
  console.log("[fetch-prices] Обновляем курсы валют...");
  await refreshRates(true);
  const config = await loadShopPricingSettings();
  const rateCnyRub = config.rate_cny_rub;
  const rateCnyUsd = config.rate_cny_usd;
  console.log(
    `[fetch-prices] Курсы: CNY→RUB=${rateCnyRub}, CNY→USD=${rateCnyUsd}`,
  );

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < noPrice.length; i++) {
    const p = noPrice[i];
    const oldSpuId = p.productId;
    const vendorCode = p.vendorCode?.trim();
    const seriesName = p.seriesName?.trim();

    // Шаг 1: ищем товар по vendorCode
    let found: SearchResultItem | null = null;
    let searchQuery = "";

    if (vendorCode) {
      found = await searchProduct(vendorCode);
      searchQuery = `vendorCode="${vendorCode}"`;
    }

    // Шаг 2: если не нашли — пробуем по seriesName (первые 30 символов)
    if (!found && seriesName && seriesName.length > 2) {
      const query =
        seriesName.length > 40 ? seriesName.slice(0, 40) : seriesName;
      found = await searchProduct(query);
      searchQuery = `series="${query}"`;
    }

    if (!found) {
      skipped++;
      if ((i + 1) % 10 === 0 || i === noPrice.length - 1) {
        console.log(
          `[fetch-prices] Прогресс: ${i + 1}/${noPrice.length} | найдено=${updated} ошибок=${failed} не_найдено=${skipped}`,
        );
      }
      if (i < noPrice.length - 1)
        await new Promise((r) => setTimeout(r, DELAY_MS));
      continue;
    }

    const newSpuId = found.spuId;

    // Шаг 3: получаем детали (authPrice)
    const detail = await fetchProductDetail(newSpuId);

    if (!detail?.detail) {
      skipped++;
      if ((i + 1) % 10 === 0 || i === noPrice.length - 1) {
        console.log(
          `[fetch-prices] Прогресс: ${i + 1}/${noPrice.length} | найдено=${updated} ошибок=${failed} не_найдено=${skipped}`,
        );
      }
      if (i < noPrice.length - 1)
        await new Promise((r) => setTimeout(r, DELAY_MS));
      continue;
    }

    const authPriceCny = detail.detail.authPrice || 0;
    const title = detail.detail.title || found.title || "";
    const images =
      detail.image?.spuImage?.images?.map((img) => img.url) ??
      found.images ??
      p.images ??
      [];

    if (authPriceCny <= 0) {
      skipped++;
      if ((i + 1) % 10 === 0 || i === noPrice.length - 1) {
        console.log(
          `[fetch-prices] Прогресс: ${i + 1}/${noPrice.length} | найдено=${updated} ошибок=${failed} не_найдено=${skipped}`,
        );
      }
      if (i < noPrice.length - 1)
        await new Promise((r) => setTimeout(r, DELAY_MS));
      continue;
    }

    // Цена: authPrice уже в юанях (не в фэнях)
    const priceCny = authPriceCny;
    const priceRub = Math.round(priceCny * rateCnyRub * 100) / 100;
    const priceUsdt = Math.round((priceCny / rateCnyUsd) * 10000) / 10000;

    const name =
      title ||
      [p.seriesName, p.vendorCode].filter(Boolean).join(" ") ||
      `${p.vendor || "Unknown"} #${oldSpuId}`;

    try {
      await supabaseUpsert(
        "products",
        {
          poizon_id: String(newSpuId),
          name,
          brand: p.vendor || null,
          image_urls: images.length > 0 ? images : p.images || [],
          price_cny: Math.round(priceCny * 100) / 100,
          price_rub: priceRub,
          price_usdt: priceUsdt,
          is_available: detail.detail.status === 1,
          source: "poizon",
          synced_at: now,
          updated_at: now,
        },
        "poizon_id",
      );
      updated++;
      console.log(
        `  [OK] #${i + 1} old=${oldSpuId} → new=${newSpuId} authPrice=${authPriceCny}¥ ${searchQuery}`,
      );
    } catch (e) {
      failed++;
      console.error(
        `[fetch-prices] Ошибка upsert oldSpuId=${oldSpuId}: ${(e as Error).message}`,
      );
    }

    if ((i + 1) % 10 === 0 || i === noPrice.length - 1) {
      console.log(
        `[fetch-prices] Прогресс: ${i + 1}/${noPrice.length} | найдено=${updated} ошибок=${failed} не_найдено=${skipped}`,
      );
    }

    if (i < noPrice.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log("\n[fetch-prices] Готово!");
  console.log(`  Обновлено: ${updated}`);
  console.log(`  Ошибок: ${failed}`);
  console.log(`  Не найдено / без цены: ${skipped}`);
}

main().catch((e) => {
  console.error("Критическая ошибка:", e);
  process.exit(1);
});
