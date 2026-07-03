import type { ProductGender } from "@poizon-shop/shared";
import {
  isCatalogGender,
  normalizeProductGender,
} from "../lib/normalize-gender.js";
import { stripCjk } from "./poizon-sku.mapper.js";
import { type SizePricesMap, minSizePrice } from "./product-pricing.js";

export interface Pop2Category {
  id: number;
  name: string;
  parentId?: number;
  rootId?: number;
}

export interface Pop2Brand {
  id: number;
  name: string;
  logoUrl?: string;
}

export interface Pop2Property {
  key: string;
  value: string;
}

export interface Pop2Child {
  params?: Pop2Property[];
  price?: number;
  purchasePrice?: number;
  available?: boolean;
}

export interface Pop2Product {
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

export interface Pop2Data {
  categories: Pop2Category[];
  brands: Pop2Brand[];
  products: Pop2Product[];
}

export type Export3UpsertRow = {
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

export type Export3MapResult =
  | { status: "mapped"; row: Export3UpsertRow }
  | { status: "skipped"; reason: "no_price" | "no_images" };

export type Export3Rates = {
  rateCnyRub: number;
  rateCnyUsd: number;
};

export function createCategorySlug(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (/\bwatch(?:es)?\b|час(?:ы|ов)?/i.test(normalized)) {
    return "watches";
  }

  return normalized.replace(/[^a-zа-яё0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildProductName(p: Pop2Product): string {
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

export function extractSizeLabel(
  params: Pop2Property[] | undefined,
): string | null {
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

function numericSizeSort(a: string, b: string): number {
  const na = Number.parseFloat(a.replace(",", "."));
  const nb = Number.parseFloat(b.replace(",", "."));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, "ru", { numeric: true });
}

export function buildVariantPricing(
  product: Pop2Product,
  rates: Export3Rates,
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

    const prices = rubToSizePrice(priceRub, rates.rateCnyRub, rates.rateCnyUsd);
    const existing = sizePrices[size];
    if (!existing || prices.rub < existing.rub) {
      sizePrices[size] = prices;
    }
    stock[size] = child.available !== false;
  }

  return {
    size_prices: sizePrices,
    sizes: Object.keys(sizePrices).sort(numericSizeSort),
    stock,
  };
}

export function hasImportablePrice(product: Pop2Product): boolean {
  if (product.price && product.price > 0) return true;
  return (product.children ?? []).some(
    (child) => (child.price || child.purchasePrice || 0) > 0,
  );
}

function collectGenderHints(product: Pop2Product): string[] {
  const hints: string[] = [];
  if (product.title?.trim()) hints.push(product.title.trim());
  if (product.keywords?.length) hints.push(product.keywords.join(" "));
  if (product.vendorCode?.trim()) hints.push(product.vendorCode.trim());
  if (product.seriesName?.trim()) hints.push(product.seriesName.trim());
  return hints;
}

/** Avoid inferring gender from neutral text; Cyrillic-safe (JS \\b ignores Cyrillic). */
function hintHasExplicitCatalogGender(hint: string): boolean {
  if (/\b(?:male|female|men'?s?|women'?s?)\b/i.test(hint)) return true;
  return /мужск|мужчин|женск|женщин/i.test(hint);
}

/** Resolves catalog gender from field, then from title/keywords when export marks Unisex. */
export function resolveImportGender(
  product: Pop2Product,
): ProductGender | null {
  const direct = normalizeProductGender(product.gender);
  if (isCatalogGender(direct)) return direct;

  for (const hint of collectGenderHints(product)) {
    if (!hintHasExplicitCatalogGender(hint)) continue;
    const inferred = normalizeProductGender(hint);
    if (isCatalogGender(inferred)) return inferred;
  }

  return null;
}

export function isImportableProduct(product: Pop2Product): boolean {
  return hasImportablePrice(product);
}

export function buildImportableProductIdSet(data: Pop2Data): Set<string> {
  const keep = new Set<string>();
  for (const product of data.products ?? []) {
    if (isImportableProduct(product)) {
      keep.add(String(product.productId));
    }
  }
  return keep;
}

export function mapExport3ProductToUpsertRow(
  p: Pop2Product,
  opts: Export3Rates & { categoryCache: Map<number, string> },
): Export3MapResult {
  if (!p.images || p.images.length === 0) {
    return { status: "skipped", reason: "no_images" };
  }

  const variantPricing = buildVariantPricing(p, opts);
  const scalarFromSizes = minSizePrice(variantPricing.size_prices);
  const priceRub = scalarFromSizes?.rub ?? p.price ?? 0;

  if (priceRub <= 0) {
    return { status: "skipped", reason: "no_price" };
  }

  const priceCny =
    scalarFromSizes?.cny ??
    Math.round((priceRub / opts.rateCnyRub) * 100) / 100;
  const priceUsdt =
    scalarFromSizes?.usdt ??
    Math.round((priceCny / opts.rateCnyUsd) * 10000) / 10000;

  const sizeLabels =
    variantPricing.sizes.length > 0
      ? variantPricing.sizes
      : p.sizes && p.sizes.length > 0
        ? [...p.sizes].sort(numericSizeSort)
        : [];

  const stock =
    variantPricing.sizes.length > 0
      ? variantPricing.stock
      : sizeLabels.length > 0
        ? Object.fromEntries(sizeLabels.map((size) => [size, true]))
        : {};

  const normalizedGender = resolveImportGender(p);

  return {
    status: "mapped",
    row: {
      poizon_id: String(p.productId),
      name: buildProductName(p),
      brand: p.vendor || null,
      category_id: opts.categoryCache.get(p.categoryId) ?? null,
      image_urls: p.images,
      price_cny: priceCny,
      price_rub: priceRub,
      price_usdt: priceUsdt,
      size_prices: variantPricing.size_prices,
      sizes: sizeLabels.length > 0 ? { EU: sizeLabels } : {},
      stock,
      sold_count: p.favoriteCount || 0,
      is_available: true,
      gender: normalizedGender,
    },
  };
}
