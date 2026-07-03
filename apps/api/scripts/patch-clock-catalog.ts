/**
 * Проставляет gender и category_id для часов из clock.json
 * (в т.ч. после fetch-missing-prices, где poizon_id мог смениться).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getSupabase } from "../src/db/client.js";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import {
  type Pop2Data,
  createCategorySlug,
  resolveImportGender,
} from "../src/services/export3-import.mapper.js";

loadDotEnv();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function safeFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
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

async function supabaseGet(path: string): Promise<unknown> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await safeFetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function ensureCategories(
  data: Pop2Data,
): Promise<Map<number, string>> {
  const categoryCache = new Map<number, string>();

  for (const cat of data.categories ?? []) {
    const existing = (await supabaseGet(
      `categories?select=id&poizon_id=eq.${cat.id}`,
    )) as { id: string }[] | null;

    if (existing?.length) {
      categoryCache.set(cat.id, existing[0].id);
      continue;
    }

    const slug = createCategorySlug(cat.name);
    const parentId =
      cat.parentId && cat.parentId !== cat.id && cat.parentId !== cat.rootId
        ? (categoryCache.get(cat.parentId) ?? null)
        : null;

    const insertRes = await safeFetch(`${SUPABASE_URL}/rest/v1/categories`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        name: cat.name,
        name_ru: cat.name,
        slug,
        parent_id: parentId,
        poizon_id: String(cat.id),
      }),
    });
    if (!insertRes.ok) {
      console.warn(`[patch-clock] category "${cat.name}": ${insertRes.status}`);
      continue;
    }

    const created = (await supabaseGet(
      `categories?select=id&poizon_id=eq.${cat.id}`,
    )) as { id: string }[] | null;
    if (created?.length) categoryCache.set(cat.id, created[0].id);
  }

  return categoryCache;
}

const COLOR_NAME_HINTS: Record<string, string[]> = {
  серебр: ["银", "silver"],
  silver: ["银", "silver"],
  бел: ["白", "white"],
  white: ["白", "white"],
  черн: ["黑", "black"],
  black: ["黑", "black"],
  син: ["蓝", "blue"],
  blue: ["蓝", "blue"],
  зелен: ["绿", "green"],
  green: ["绿", "green"],
  розов: ["粉", "pink"],
  pink: ["粉", "pink"],
  беж: ["贝母", "beige"],
};

function colorSearchTerms(title: string): string[] {
  const lower = title.toLowerCase();
  const terms = new Set<string>();
  for (const [prefix, mapped] of Object.entries(COLOR_NAME_HINTS)) {
    if (lower.includes(prefix)) for (const term of mapped) terms.add(term);
  }
  return [...terms];
}

async function findProductRow(
  product: Pop2Data["products"][number],
  poizonId: string,
  usedIds: Set<string>,
): Promise<{ id: string; poizon_id: string; name: string } | null> {
  const vendorCode = product.vendorCode?.trim();
  const isUnused = (row: { id: string }) => !usedIds.has(row.id);

  const byPoizon = (await supabaseGet(
    `products?select=id,poizon_id,name&poizon_id=eq.${poizonId}`,
  )) as { id: string; poizon_id: string; name: string }[] | null;
  if (byPoizon?.filter(isUnused).length) return byPoizon.filter(isUnused)[0];

  if (vendorCode) {
    const { data: byCode } = await getSupabase()
      .from("products")
      .select("id, poizon_id, name")
      .eq("brand", product.vendor)
      .gt("price_rub", 0)
      .ilike("name", `%${vendorCode}%`)
      .limit(5);
    const hit = (byCode ?? []).find(isUnused);
    if (hit) return hit;
  }

  const titleHint = product.title?.trim() ?? "";
  for (const hint of colorSearchTerms(titleHint)) {
    const { data: byColor } = await getSupabase()
      .from("products")
      .select("id, poizon_id, name")
      .eq("brand", product.vendor)
      .gt("price_rub", 0)
      .is("gender", null)
      .ilike("name", `%${hint}%`)
      .limit(5);
    const hit = (byColor ?? []).find(isUnused);
    if (hit) return hit;
  }

  if (titleHint) {
    const words = titleHint
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !/^(tissot|swatch|rolex|montblanc|часы)$/i.test(w));

    for (const word of words.slice(0, 4)) {
      const { data: byWord } = await getSupabase()
        .from("products")
        .select("id, poizon_id, name")
        .eq("brand", product.vendor)
        .gt("price_rub", 0)
        .is("gender", null)
        .ilike("name", `%${word}%`)
        .limit(5);
      const hit = (byWord ?? []).find(isUnused);
      if (hit) return hit;
    }
  }

  const { data: brandRows } = await getSupabase()
    .from("products")
    .select("id, poizon_id, name")
    .eq("brand", product.vendor)
    .gt("price_rub", 0)
    .is("gender", null)
    .limit(10);

  const unused = (brandRows ?? []).filter(isUnused);
  if (unused.length === 1) return unused[0];

  return null;
}

async function main(): Promise<void> {
  const filePath =
    process.argv[2] ??
    fileURLToPath(new URL("../../../clock.json", import.meta.url));

  const data = JSON.parse(readFileSync(filePath, "utf-8")) as Pop2Data;
  const categoryCache = await ensureCategories(data);

  let patched = 0;
  let skipped = 0;
  let notFound = 0;
  const usedIds = new Set<string>();

  for (const product of data.products ?? []) {
    const gender = resolveImportGender(product);
    if (!gender) {
      skipped++;
      continue;
    }

    const categoryId = categoryCache.get(product.categoryId) ?? null;
    const poizonId = String(product.productId);

    const row = await findProductRow(product, poizonId, usedIds);
    if (!row) {
      notFound++;
      continue;
    }

    usedIds.add(row.id);
    const { error } = await getSupabase()
      .from("products")
      .update({
        gender,
        category_id: categoryId,
        is_available: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      console.warn(
        `[patch-clock] update failed poizon=${row.poizon_id}:`,
        error.message,
      );
      continue;
    }

    patched++;
    console.log(
      `[patch-clock] OK poizon=${row.poizon_id} gender=${gender} category=${categoryId ?? "null"}`,
    );
  }

  console.log(
    `\n[patch-clock] patched=${patched} skipped=${skipped} notFound=${notFound}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
