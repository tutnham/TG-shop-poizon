import type {
  ProductDetail,
  ProductGender,
  ProductListItem,
  SizePricesMap,
} from "@poizon-shop/shared";
import { dedupeByNameRu, dedupeDisplayLabels } from "../lib/dedupe-labels.js";
import { sanitizeSearchQuery } from "../lib/search-sanitize.js";
import { getSupabase } from "./client.js";

type ProductRow = {
  id: string;
  name: string;
  name_ru: string | null;
  brand: string | null;
  image_urls: string[] | null;
  price_rub: number;
  price_usdt: number;
  is_available: boolean;
  sold_count: number;
  synced_at: string | null;
  price_cny: number | null;
  size_prices: SizePricesMap;
  sizes: Record<string, string[]>;
  stock: Record<string, boolean>;
  category_id: string | null;
  source: string;
  gender: ProductGender | null;
};

function toListItem(row: ProductRow): ProductListItem {
  return {
    id: row.id,
    name: row.name_ru ?? row.name,
    brand: row.brand,
    image_url: row.image_urls?.[0] ?? null,
    price_rub: Number(row.price_rub),
    price_usdt: Number(row.price_usdt),
    is_available: row.is_available,
    sold_count: row.sold_count,
    gender: row.gender ?? null,
    synced_at: row.synced_at,
  };
}

const LIST_PRODUCT_COLUMNS =
  "id, name, name_ru, brand, image_urls, price_rub, price_usdt, is_available, sold_count, synced_at, gender";

async function resolveCategoryIdBySlug(slug: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

const CATALOG_GENDER_OR_NULL_FILTER =
  "gender.is.null,gender.eq.male,gender.eq.female";

function isVisibleInCatalog(row: ProductRow): boolean {
  if (!row.is_available || Number(row.price_rub) <= 0) return false;
  if (row.gender == null) return true;
  return row.gender === "male" || row.gender === "female";
}

export async function listProducts(opts: {
  page: number;
  limit: number;
  category?: string;
  brand?: string;
  search?: string;
  sort: string;
  min_price?: number;
  max_price?: number;
  size?: string;
  gender?: ProductGender;
}): Promise<{ items: ProductListItem[]; total: number }> {
  let query = getSupabase()
    .from("products")
    .select(LIST_PRODUCT_COLUMNS, { count: "exact" })
    .eq("is_available", true)
    .gt("price_rub", 0)
    .or(CATALOG_GENDER_OR_NULL_FILTER);

  if (opts.category) {
    const categoryId = await resolveCategoryIdBySlug(opts.category);
    if (!categoryId) return { items: [], total: 0 };
    query = query.eq("category_id", categoryId);
  }
  if (opts.brand) {
    const brand = sanitizeSearchQuery(opts.brand);
    if (brand) query = query.ilike("brand", brand);
  }
  if (opts.search) {
    const term = sanitizeSearchQuery(opts.search);
    if (term) query = query.or(`name.ilike.%${term}%,name_ru.ilike.%${term}%`);
  }
  if (opts.min_price != null) query = query.gte("price_rub", opts.min_price);
  if (opts.max_price != null) query = query.lte("price_rub", opts.max_price);
  if (opts.gender) query = query.eq("gender", opts.gender);
  if (opts.size) {
    const sizeKey = opts.size.trim();
    if (sizeKey) {
      query = query.contains("stock", { [sizeKey]: true });
    }
  }

  switch (opts.sort) {
    case "price_asc":
      query = query.order("price_rub", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price_rub", { ascending: false });
      break;
    case "new":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("sold_count", { ascending: false });
  }

  const from = (opts.page - 1) * opts.limit;
  const { data, count, error } = await query.range(from, from + opts.limit - 1);
  if (error) throw new Error(error.message);

  return {
    items: (data as ProductRow[]).map(toListItem),
    total: count ?? 0,
  };
}

export async function getProductById(
  id: string,
): Promise<ProductDetail | null> {
  const { data, error } = await getSupabase()
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !isVisibleInCatalog(data as ProductRow)) return null;
  return rowToProductDetail(data as ProductRow);
}

export async function getProductByPoizonId(
  poizonId: string,
): Promise<ProductDetail | null> {
  const { data, error } = await getSupabase()
    .from("products")
    .select("*")
    .eq("poizon_id", poizonId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !isVisibleInCatalog(data as ProductRow)) return null;
  return rowToProductDetail(data as ProductRow);
}

function rowToProductDetail(row: ProductRow): ProductDetail {
  const base = toListItem(row);
  return {
    ...base,
    name_ru: row.name_ru,
    image_urls: row.image_urls ?? [],
    sizes: (row.sizes as Record<string, string[]>) ?? {},
    stock: (row.stock as Record<string, boolean>) ?? {},
    size_prices: (row.size_prices as SizePricesMap) ?? {},
    price_cny: row.price_cny != null ? Number(row.price_cny) : null,
    category_id: row.category_id,
  };
}

export async function listCategories(): Promise<
  { id: string; name: string; name_ru: string; slug: string }[]
> {
  const { data: productRows, error: productError } = await getSupabase()
    .from("products")
    .select("category_id")
    .eq("is_available", true)
    .gt("price_rub", 0)
    .or(CATALOG_GENDER_OR_NULL_FILTER)
    .not("category_id", "is", null);
  if (productError) throw new Error(productError.message);

  const categoryIds = [
    ...new Set(
      (productRows ?? [])
        .map((row) => row.category_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (categoryIds.length === 0) return [];

  const { data, error } = await getSupabase()
    .from("categories")
    .select("id, name, name_ru, slug")
    .in("id", categoryIds);
  if (error) throw new Error(error.message);
  return dedupeByNameRu(data ?? []);
}

export async function listBrands(
  opts: {
    category?: string;
  } = {},
): Promise<string[]> {
  const categoryId = opts.category
    ? await resolveCategoryIdBySlug(opts.category)
    : null;
  if (opts.category && !categoryId) return [];

  let query = getSupabase()
    .from("products")
    .select("brand")
    .eq("is_available", true)
    .gt("price_rub", 0)
    .or(CATALOG_GENDER_OR_NULL_FILTER)
    .not("brand", "is", null);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const brands = (data ?? [])
    .map((row) => row.brand)
    .filter((b): b is string => Boolean(b));
  return dedupeDisplayLabels(brands);
}

const GENDER_ORDER: ProductGender[] = ["male", "female"];

function numericSizeSort(a: string, b: string): number {
  const na = Number.parseFloat(a.replace(",", "."));
  const nb = Number.parseFloat(b.replace(",", "."));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Distinct available sizes from in-stock products (for catalog filter chips). */
export async function listAvailableSizes(
  opts: {
    category?: string;
  } = {},
): Promise<string[]> {
  const categoryId = opts.category
    ? await resolveCategoryIdBySlug(opts.category)
    : null;
  if (opts.category && !categoryId) return [];

  let query = getSupabase()
    .from("products")
    .select("stock")
    .eq("is_available", true)
    .gt("price_rub", 0)
    .or(CATALOG_GENDER_OR_NULL_FILTER);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const sizes = new Set<string>();
  for (const row of data ?? []) {
    const stock = (row.stock as Record<string, boolean> | null) ?? {};
    for (const [label, available] of Object.entries(stock)) {
      if (available !== false && label.trim()) sizes.add(label.trim());
    }
  }
  return [...sizes].sort(numericSizeSort);
}

/** Distinct normalized genders present in available catalog. */
export async function listAvailableGenders(
  opts: {
    category?: string;
  } = {},
): Promise<ProductGender[]> {
  const categoryId = opts.category
    ? await resolveCategoryIdBySlug(opts.category)
    : null;
  if (opts.category && !categoryId) return [];

  let query = getSupabase()
    .from("products")
    .select("gender")
    .eq("is_available", true)
    .gt("price_rub", 0)
    .or(CATALOG_GENDER_OR_NULL_FILTER);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const seen = new Set<ProductGender>();
  for (const row of data ?? []) {
    const g = row.gender as ProductGender | null;
    if (g) seen.add(g);
  }
  return GENDER_ORDER.filter((g) => seen.has(g));
}

export async function setProductVisibility(
  id: string,
  visible: boolean,
): Promise<void> {
  const { error } = await getSupabase()
    .from("products")
    .update({ is_available: visible, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

type UpsertProductRow = {
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
  gender?: ProductGender | null;
  shihuo_goods_id?: string | null;
  shihuo_style_id?: string | null;
};

export async function upsertProductFromPoizon(
  row: UpsertProductRow,
): Promise<void> {
  await upsertProductRow(row, "poizon");
}

export async function upsertImportedProduct(
  row: UpsertProductRow,
): Promise<void> {
  await upsertProductRow(row, "user_import");
}

async function upsertProductRow(
  row: UpsertProductRow,
  source: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("products")
    .upsert(
      {
        ...row,
        source,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "poizon_id" },
    );
  if (error) throw new Error(error.message);
}

/** Пакетный upsert товаров чанками по BATCH_SIZE для обработки 9000+ записей */
const UPSERT_BATCH_SIZE = 100;

export async function upsertProductsBatch(
  rows: UpsertProductRow[],
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_BATCH_SIZE).map((row) => ({
      ...row,
      source: "poizon",
      synced_at: now,
      updated_at: now,
    }));

    const { error } = await getSupabase()
      .from("products")
      .upsert(chunk, { onConflict: "poizon_id" });

    if (error) {
      errors += chunk.length;
      console.warn(
        `[product-repo] batch upsert chunk ${i / UPSERT_BATCH_SIZE} failed:`,
        error.message,
      );
    } else {
      inserted += chunk.length;
    }
  }

  return { inserted, errors };
}

export async function getLastSyncTime(): Promise<string | null> {
  const { data } = await getSupabase()
    .from("sync_logs")
    .select("finished_at")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.finished_at ?? null;
}
