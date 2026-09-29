import type { ProductGender } from "@poizon-shop/shared";
import {
  isCatalogGender,
  normalizeProductGender,
} from "../lib/normalize-gender.js";
import {
  type SyncPricingContext,
  calculateProductPrices,
} from "./pricing.service.js";
import type { SizePricesMap } from "./product-pricing.js";

export type ExcelField =
  | "article"
  | "name"
  | "brand"
  | "category"
  | "price"
  | "currency"
  | "sizes"
  | "images"
  | "gender";

export const EXCEL_IMPORT_SOURCE = "excel_import";

export const DEFAULT_EXCEL_COLUMN_MAP: Record<ExcelField, string[]> = {
  article: ["артикул", "код товара", "article", "sku", "код"],
  name: ["название", "наименование", "name", "title", "товар"],
  brand: ["бренд", "brand", "производитель", "vendor"],
  category: ["категория", "category", "раздел", "группа"],
  price: ["цена", "price", "стоимость"],
  currency: ["валюта", "currency"],
  sizes: ["размеры", "размерный ряд", "sizes", "размер"],
  images: ["фото", "изображения", "фотографии", "images", "image"],
  gender: ["пол", "gender"],
};

/** Ячейка после парсера: нормализованный текст + гиперссылка (для фото). */
export type ExcelCell = { text: string; hyperlink?: string };

export type ExcelRowFields = Partial<Record<ExcelField, ExcelCell>>;

export type RawExcelRow = {
  rowNum: number;
  fields: ExcelRowFields;
  /** Фото, вставленные поверх строки (учитывается при requireImages). */
  embeddedImageCount?: number;
};

export type ExcelUpsertRow = {
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
  gender: ProductGender | null;
};

export type ExcelSkipReason =
  | "no_article"
  | "no_price"
  | "no_name"
  | "no_images";

export type ExcelMapResult =
  | { status: "mapped"; row: ExcelUpsertRow }
  | { status: "skipped"; reason: ExcelSkipReason };

export type ExcelMapContext = {
  pricingCtx: SyncPricingContext;
  defaultCurrency: "CNY" | "RUB";
  requireImages: boolean;
  resolveCategoryId: (categoryName: string) => string | null;
};

export function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export type ExcelHeaderMatch = {
  mapping: Partial<Record<ExcelField, number>>;
  unrecognized: string[];
};

/**
 * Сопоставляет заголовки листа полям по алиасам (точный матч приоритетнее includes).
 * overrides — дополнительные алиасы из shop_config.excel_import_mapping.
 */
export function matchExcelHeaders(
  headers: (string | null)[],
  overrides: Partial<Record<ExcelField, string[]>> = {},
): ExcelHeaderMatch {
  const aliasMap: Record<ExcelField, string[]> = {
    ...DEFAULT_EXCEL_COLUMN_MAP,
    ...overrides,
  };
  const mapping: Partial<Record<ExcelField, number>> = {};
  const usedColumns = new Set<number>();
  const normalized = headers.map((h) => (h ? normalizeHeader(h) : ""));

  for (const pass of ["exact", "partial"] as const) {
    for (const [field, aliases] of Object.entries(aliasMap) as [
      ExcelField,
      string[],
    ][]) {
      if (mapping[field] != null) continue;
      const sortedAliases = [...aliases]
        .map(normalizeHeader)
        .sort((a, b) => b.length - a.length);
      let best: { col: number; aliasLen: number } | null = null;
      for (let col = 0; col < normalized.length; col++) {
        const header = normalized[col];
        if (usedColumns.has(col) || !header) continue;
        for (const a of sortedAliases) {
          const matched =
            pass === "exact"
              ? header === a
              : header.includes(a) || a.includes(header);
          if (matched) {
            if (pass === "partial") best = { col, aliasLen: a.length };
            else if (!best || a.length > best.aliasLen) {
              best = { col, aliasLen: a.length };
            }
            break;
          }
        }
        if (best && pass === "partial") break;
      }
      if (best) {
        mapping[field] = best.col;
        usedColumns.add(best.col);
      }
    }
  }

  const unrecognized = headers.filter(
    (h, i) => h?.trim() && !usedColumns.has(i),
  ) as string[];
  return { mapping, unrecognized };
}

export type ExcelCurrency = "CNY" | "RUB";

export function parseCurrency(
  cell: ExcelCell | undefined,
  fallback: ExcelCurrency,
): ExcelCurrency {
  const raw = cell?.text.trim().toLowerCase() ?? "";
  if (!raw) return fallback;
  if (/(руб|rub|₽)/.test(raw)) return "RUB";
  if (/(юан|cny|rmb|¥|кит)/.test(raw)) return "CNY";
  return fallback;
}

export function parsePrice(cell: ExcelCell | undefined): number {
  const raw = cell?.text.trim() ?? "";
  if (!raw) return 0;
  const cleaned = raw
    .replace(/[^\d.,-]/g, "")
    .replace(/(?!^)-/g, "")
    .replace(",", ".");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeSizeLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withDot = trimmed.replace(",", ".");
  if (/^-?\d+(?:\.\d+)?$/.test(withDot)) {
    return String(Number(withDot));
  }
  return trimmed;
}

function numericSizeSort(a: string, b: string): number {
  const na = Number.parseFloat(a.replace(",", "."));
  const nb = Number.parseFloat(b.replace(",", "."));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  // Буквенные размеры (S/M/L) сохраняют исходный порядок файла (sort стабилен)
  if (!Number.isFinite(na) && !Number.isFinite(nb)) return 0;
  return Number.isFinite(na) ? -1 : 1;
}

export function splitSizes(cell: ExcelCell | undefined): string[] {
  const raw = cell?.text ?? "";
  if (!raw.trim()) return [];
  const labels = raw
    .split(/[,;\n\r/\s]+/)
    .map(normalizeSizeLabel)
    .filter(Boolean);
  return [...new Set(labels)].sort(numericSizeSort);
}

export function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    if (parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch {
    return "";
  }
}

export function splitImages(cell: ExcelCell | undefined): string[] {
  if (!cell) return [];
  const candidates = [
    ...cell.text.split(/[\s,;\n\r]+/),
    ...(cell.hyperlink ? [cell.hyperlink] : []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    const url = normalizeImageUrl(candidate);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** Явная гендерная лексика в тексте (тот же guard, что в resolveImportGender). */
function hasExplicitGenderHint(text: string): boolean {
  if (/\b(?:male|female|men'?s?|women'?s?)\b/i.test(text)) return true;
  return /мужск|мужчин|женск|женщин/i.test(text);
}

export function resolveExcelGender(
  genderCell: ExcelCell | undefined,
  name: string,
): ProductGender | null {
  const direct = normalizeProductGender(genderCell?.text ?? null);
  if (isCatalogGender(direct)) return direct;
  if (hasExplicitGenderHint(name)) {
    const inferred = normalizeProductGender(name);
    if (isCatalogGender(inferred)) return inferred;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function computeExcelPrices(
  price: number,
  currency: ExcelCurrency,
  ctx: SyncPricingContext,
): { cny: number; rub: number; usdt: number } {
  if (currency === "CNY") {
    const cny = round2(price);
    const prices = calculateProductPrices(cny, ctx);
    return { cny, rub: prices.rub, usdt: prices.usdt };
  }
  // RUB из таблицы — финальная розничная цена, без наценки (прецедент pop2)
  const rub = round2(price);
  const cny = round2(rub / ctx.rateCnyRub.toNumber());
  const usdt = round4(cny / ctx.rateCnyUsd.toNumber());
  return { cny, rub, usdt };
}

export function mapExcelRowToUpsertRow(
  row: RawExcelRow,
  ctx: ExcelMapContext,
): ExcelMapResult {
  const article = row.fields.article?.text.trim() ?? "";
  if (!article) return { status: "skipped", reason: "no_article" };

  const price = parsePrice(row.fields.price);
  if (price <= 0) return { status: "skipped", reason: "no_price" };

  const brand = row.fields.brand?.text.trim() || null;
  const rawName = row.fields.name?.text.trim() ?? "";
  const name = rawName || (brand ? `${brand} ${article}`.trim() : "");
  if (!name) return { status: "skipped", reason: "no_name" };

  const imageUrls = splitImages(row.fields.images);
  if (ctx.requireImages && imageUrls.length === 0 && !row.embeddedImageCount) {
    return { status: "skipped", reason: "no_images" };
  }

  const currency = parseCurrency(row.fields.currency, ctx.defaultCurrency);
  const prices = computeExcelPrices(price, currency, ctx.pricingCtx);
  const sizeLabels = splitSizes(row.fields.sizes);

  const sizePrices: SizePricesMap = {};
  for (const size of sizeLabels) {
    sizePrices[size] = { cny: prices.cny, rub: prices.rub, usdt: prices.usdt };
  }

  const categoryName = row.fields.category?.text.trim() ?? "";
  const categoryId = categoryName ? ctx.resolveCategoryId(categoryName) : null;

  return {
    status: "mapped",
    row: {
      poizon_id: article,
      name,
      brand,
      category_id: categoryId,
      image_urls: imageUrls,
      price_cny: prices.cny,
      price_rub: prices.rub,
      price_usdt: prices.usdt,
      size_prices: sizePrices,
      sizes: sizeLabels.length > 0 ? { EU: sizeLabels } : {},
      stock: Object.fromEntries(sizeLabels.map((s) => [s, true])),
      sold_count: 0,
      is_available: true,
      gender: resolveExcelGender(row.fields.gender, name),
    },
  };
}
