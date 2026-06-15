import { getSupabase } from "../db/client.js";
import { setConfigValue } from "../db/config.repository.js";
import * as productRepo from "../db/product.repository.js";
import {
  VERCEL_SYNC_BLOCKED_MESSAGE,
  isVercelServerless,
} from "../lib/runtime.js";
import { refreshRates } from "./currency.service.js";
import type { IPoisonProvider } from "./poizon.provider.js";
import { getPoisonProvider } from "./poizon.service.js";
import type { PoisonProductRaw } from "./poizon.provider.js";
import {
  buildSizePricesFromFen,
  minSizePrice,
  type SizePricesMap,
} from "./product-pricing.js";
import { calculatePricesFromFen, getPricingConfig } from "./pricing.service.js";
import type { PricingConfig } from "./pricing.service.js";

const SYNC_KEYWORDS = [
  "nike",
  "jordan",
  "adidas",
  "yeezy",
  "new balance",
  "asics",
  "puma",
  "reebok",
];
const SYNC_PAGE_SIZE = 50; // Товаров на страницу при пагинации API
const SYNC_MAX_PAGES_PER_KEYWORD = 60; // Макс 3000 товаров на ключевое слово
const SYNC_DELAY_BETWEEN_PAGES_MS = 1200;
const SYNC_DELAY_BETWEEN_DETAILS_MS = 800;
const SYNC_DELAY_JITTER_MS = 300;
const UPSERT_BATCH_SIZE = 100; // Размер пакета для upsert в БД

/** Стандартные EU размеры кроссовок, используемые когда API не возвращает размеры */
const DEFAULT_EU_SIZES = ["39", "40", "41", "42", "43", "44", "45", "46"];

type UpsertRow = Parameters<typeof productRepo.upsertProductsBatch>[0][number];

export function mapPoizonItemToUpsertRow(
  item: PoisonProductRaw,
  config: PricingConfig,
): UpsertRow {
  const hasSkuPrices = Object.keys(item.sizePricesFen).length > 0;
  const sizePrices: SizePricesMap = hasSkuPrices
    ? buildSizePricesFromFen(item.sizePricesFen, config)
    : {};

  const scalarFromSkus = minSizePrice(sizePrices);
  const fallbackPrices = calculatePricesFromFen(item.priceFen, config);
  const scalar = scalarFromSkus ?? {
    cny: fallbackPrices.cny,
    rub: fallbackPrices.rub,
    usdt: fallbackPrices.usdt,
  };

  const hasSizes = Object.keys(item.sizes).length > 0;
  const sizeLabels = hasSizes
    ? Object.keys(item.sizes)
    : hasSkuPrices
      ? Object.keys(sizePrices)
      : DEFAULT_EU_SIZES;

  const stock = hasSizes
    ? item.sizes
    : hasSkuPrices
      ? Object.fromEntries(
          sizeLabels.map((s) => [s, sizePrices[s] != null]),
        )
      : Object.fromEntries(DEFAULT_EU_SIZES.map((s) => [s, true]));

  return {
    poizon_id: String(item.spuId),
    name: item.englishTitle || item.title,
    brand: item.brand,
    category_id: null,
    image_urls: item.images,
    price_cny: scalar.cny,
    price_rub: scalar.rub,
    price_usdt: scalar.usdt,
    size_prices: sizePrices,
    sizes: { EU: sizeLabels },
    stock,
    sold_count: item.soldCount,
    is_available: item.inStock,
  };
}

async function enrichWithProductDetail(
  provider: IPoisonProvider,
  item: PoisonProductRaw,
): Promise<PoisonProductRaw> {
  try {
    const detail = await provider.getProductDetail(item.spuId);
    if (!detail) return item;
    return {
      ...item,
      ...detail,
      images: detail.images.length ? detail.images : item.images,
      soldCount: detail.soldCount || item.soldCount,
    };
  } catch (e) {
    console.warn(
      `[poizon-sync] detail fetch spuId=${item.spuId}:`,
      (e as Error).message,
    );
    return item;
  }
}

export async function runFullSync(): Promise<{
  ok: boolean;
  items_synced: number;
  error?: string;
}> {
  if (isVercelServerless()) {
    return {
      ok: false,
      items_synced: 0,
      error: VERCEL_SYNC_BLOCKED_MESSAGE,
    };
  }

  const logId = await startSyncLog();
  let items_synced = 0;
  let total_pages = 0;

  try {
    // Предварительный прогрев курсов валют
    await refreshRates(true);
    const config = await getPricingConfig({ skipRatesRefresh: true });
    const provider = getPoisonProvider();

    // Задержка перед первым запросом чтобы не перегружать API
    await sleep(SYNC_DELAY_BETWEEN_PAGES_MS);

    for (const keyword of SYNC_KEYWORDS) {
      console.log(
        `[poizon-sync] Начинаем синхронизацию по ключевому слову: "${keyword}"`,
      );

      for (let page = 0; page < SYNC_MAX_PAGES_PER_KEYWORD; page++) {
        let result: Awaited<ReturnType<IPoisonProvider["searchProducts"]>>;
        try {
          result = await provider.searchProducts(keyword, SYNC_PAGE_SIZE, page);
        } catch (e) {
          console.warn(
            `[poizon-sync] Ошибка поиска "${keyword}" страница ${page}:`,
            (e as Error).message,
          );
          break; // Прерываем цикл по этому ключевому слову при ошибке
        }

        if (!result.items.length) {
          console.log(
            `[poizon-sync] "${keyword}" страница ${page}: нет товаров, завершаем`,
          );
          break;
        }

        const batch: UpsertRow[] = [];
        for (const item of result.items) {
          try {
            const enriched = await enrichWithProductDetail(provider, item);
            batch.push(mapPoizonItemToUpsertRow(enriched, config));
            await sleep(
              SYNC_DELAY_BETWEEN_DETAILS_MS +
                Math.random() * SYNC_DELAY_JITTER_MS,
            );
          } catch (e) {
            console.warn(
              `[poizon-sync] Ошибка расчёта цены spuId=${item.spuId}:`,
              (e as Error).message,
            );
          }
        }

        // Пакетный upsert
        if (batch.length > 0) {
          const { inserted, errors } =
            await productRepo.upsertProductsBatch(batch);
          items_synced += inserted;
          if (errors > 0) {
            console.warn(`[poizon-sync] Ошибок upsert в пакете: ${errors}`);
          }
        }

        total_pages++;
        const progress = items_synced;
        console.log(
          `[poizon-sync] Прогресс: ключ="${keyword}" стр.${page + 1} | ` +
            `всего товаров=${progress} | страниц=${total_pages}`,
        );

        if (!result.hasMore) {
          console.log(`[poizon-sync] "${keyword}": больше страниц нет`);
          break;
        }

        // Задержка между страницами для соблюдения rate-limit
        await sleep(
          SYNC_DELAY_BETWEEN_PAGES_MS + Math.random() * SYNC_DELAY_JITTER_MS,
        );
      }
    }

    await finishSyncLog(logId, "success", items_synced);
    await setConfigValue("last_synced_at", new Date().toISOString());
    console.log(
      `[poizon-sync] Синхронизация завершена: ${items_synced} товаров`,
    );
    return { ok: true, items_synced };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    await finishSyncLog(logId, "error", items_synced, msg);
    return { ok: false, items_synced, error: msg };
  }
}

async function startSyncLog(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("sync_logs")
    .insert({ status: "running", items_synced: 0 })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

async function finishSyncLog(
  id: string | null,
  status: string,
  items: number,
  error_message?: string,
): Promise<void> {
  if (!id) return;
  const { error } = await getSupabase()
    .from("sync_logs")
    .update({
      status,
      items_synced: items,
      error_message: error_message ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.warn("[poizon-sync] finishSyncLog update error:", error.message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Тип одного элемента в сыром JSON-дампе poparce */
export interface PoparceRawProduct {
  spuId?: number | string;
  title?: string;
  brand?: string;
  logoUrl?: string;
  price?: number;
  priceFen?: number;
  inStock?: boolean;
  images?: string[];
  sizes?: Record<string, boolean>;
  soldCount?: number;
  soldCountText?: string;
}

/**
 * Импорт товаров из сырого JSON-массива (например, из файла poparce-дамп).
 * Поддерживает форматы: spuId (число/строка), price (fen), priceFen.
 * Автоматически нормализует поля под внутреннюю модель.
 */
export async function runBulkImport(
  rawProducts: PoparceRawProduct[],
): Promise<{ ok: boolean; items_synced: number; error?: string }> {
  if (isVercelServerless()) {
    return { ok: false, items_synced: 0, error: VERCEL_SYNC_BLOCKED_MESSAGE };
  }

  const logId = await startSyncLog();
  let items_synced = 0;

  try {
    await refreshRates(true);
    const config = await getPricingConfig({ skipRatesRefresh: true });

    // Нормализация сырых данных во внутренний формат
    const batch: UpsertRow[] = [];

    for (const raw of rawProducts) {
      try {
        const spuId = raw.spuId ? String(raw.spuId) : "";
        if (!spuId || !raw.title) continue;

        const priceFen = raw.priceFen ?? raw.price ?? 0;
        const soldCount =
          raw.soldCount ?? (Number.parseInt(raw.soldCountText ?? "0", 10) || 0);

        const rawSizes = raw.sizes ?? {};
        const hasSizes =
          typeof rawSizes === "object" &&
          !Array.isArray(rawSizes) &&
          Object.keys(rawSizes).length > 0;

        const item: PoisonProductRaw = {
          spuId: Number(spuId),
          title: raw.title,
          englishTitle: raw.title,
          brand: raw.brand ?? raw.title?.split(" ")[0] ?? "Unknown",
          logoUrl: raw.logoUrl ?? "",
          priceFen,
          inStock: raw.inStock !== false,
          images: raw.images?.length
            ? raw.images
            : raw.logoUrl
              ? [raw.logoUrl]
              : [],
          sizes: hasSizes ? rawSizes : {},
          sizePricesFen: {},
          soldCount,
        };

        batch.push(mapPoizonItemToUpsertRow(item, config));
      } catch (e) {
        console.warn(
          `[poizon-sync] Ошибка нормализации товара spuId=${raw.spuId}:`,
          (e as Error).message,
        );
      }
    }

    if (batch.length > 0) {
      // Разбиваем на чанки по UPSERT_BATCH_SIZE и вставляем с задержкой
      for (let i = 0; i < batch.length; i += UPSERT_BATCH_SIZE) {
        const chunk = batch.slice(i, i + UPSERT_BATCH_SIZE);
        const { inserted, errors } =
          await productRepo.upsertProductsBatch(chunk);
        items_synced += inserted;
        if (errors > 0) {
          console.warn(
            `[poizon-sync] Ошибок upsert в чанке ${i / UPSERT_BATCH_SIZE}: ${errors}`,
          );
        }
        console.log(
          `[poizon-sync] Импорт: чанк ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}/${Math.ceil(batch.length / UPSERT_BATCH_SIZE)} | ` +
            `товаров=${items_synced}/${batch.length}`,
        );
        // Небольшая задержка между чанками чтобы не перегружать БД
        if (i + UPSERT_BATCH_SIZE < batch.length) {
          await sleep(500);
        }
      }
    }

    await finishSyncLog(logId, "success", items_synced);
    await setConfigValue("last_synced_at", new Date().toISOString());
    console.log(`[poizon-sync] Импорт завершён: ${items_synced} товаров`);
    return { ok: true, items_synced };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    await finishSyncLog(logId, "error", items_synced, msg);
    return { ok: false, items_synced, error: msg };
  }
}
