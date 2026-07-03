/**
 * Удаление товаров, которых нет в Export3.json / pop2.json.
 *
 * Использование:
 *   npx tsx scripts/purge-stale-products.ts [Export3.json] [--dry-run]
 *   npx tsx scripts/purge-stale-products.ts [Export3.json] [--poizon-only]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import {
  type Pop2Data,
  buildImportableProductIdSet,
} from "../src/services/export3-import.mapper.js";
import {
  type CatalogProductIdentity,
  selectStaleProducts,
} from "../src/services/export3-replace.service.js";

loadDotEnv();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const MAX_RETRIES = 3;
const DELETE_BATCH_SIZE = 50;
const PAGE_SIZE = 200;

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith("--"));
const DRY_RUN = args.includes("--dry-run");
const POIZON_ONLY = args.includes("--poizon-only");

function headers(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function safeFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const h = new Headers(init.headers);
    h.set("Connection", "close");
    return await fetch(url, { ...init, headers: h, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllCatalogProducts(): Promise<CatalogProductIdentity[]> {
  const rows: CatalogProductIdentity[] = [];
  let lastId = "00000000-0000-0000-0000-000000000000";

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/products?select=id,poizon_id,source&id=gt.${lastId}&order=id.asc&limit=${PAGE_SIZE}`;

    const res = await safeFetch(url, { headers: headers() });
    if (!res.ok) {
      throw new Error(`GET products: ${res.status} ${await res.text()}`);
    }

    const batch = (await res.json()) as CatalogProductIdentity[];
    if (batch.length === 0) break;

    for (const row of batch) {
      lastId = row.id;
      if (row.poizon_id) rows.push(row);
    }

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

async function deleteBatch(poizonIds: string[]): Promise<void> {
  const inList = poizonIds.map((id) => encodeURIComponent(id)).join(",");
  const url = `${SUPABASE_URL}/rest/v1/products?poizon_id=in.(${inList})`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await safeFetch(url, {
        method: "DELETE",
        headers: headers(),
      });
      if (res.ok) return;
      const text = await res.text().catch(() => "");
      lastError = new Error(
        `DELETE batch: ${res.status} - ${text.slice(0, 200)}`,
      );
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError ?? new Error("DELETE batch failed");
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "[purge-stale] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required",
    );
    process.exit(1);
  }

  const filePath =
    fileArg ?? fileURLToPath(new URL("../../../Export3.json", import.meta.url));

  let data: Pop2Data;
  try {
    data = JSON.parse(readFileSync(filePath, "utf-8")) as Pop2Data;
  } catch (e) {
    console.error("[purge-stale] Failed to read JSON:", (e as Error).message);
    process.exit(1);
  }

  if (!Array.isArray(data.products)) {
    console.error("[purge-stale] Export3/pop2 JSON must contain products[]");
    process.exit(1);
  }

  const keepSet = buildImportableProductIdSet(data);
  console.log(
    `[purge-stale] keepSet=${keepSet.size} importable products from Export3 dryRun=${DRY_RUN} poizonOnly=${POIZON_ONLY}`,
  );

  console.log("[purge-stale] Loading catalog products from DB...");
  const dbProducts = await fetchAllCatalogProducts();
  console.log(`[purge-stale] DB catalog products: ${dbProducts.length}`);

  const stale = selectStaleProducts(dbProducts, keepSet, {
    poizonOnly: POIZON_ONLY,
  });
  console.log(`[purge-stale] Stale (to delete): ${stale.length}`);

  if (stale.length === 0) {
    console.log("[purge-stale] Nothing to delete.");
    return;
  }

  if (DRY_RUN) {
    console.log("[purge-stale] Dry-run sample (first 10 poizon_id):");
    for (const row of stale.slice(0, 10)) {
      console.log(`  poizon_id=${row.poizon_id} id=${row.id}`);
    }
    console.log(`[purge-stale] Would delete ${stale.length} products.`);
    return;
  }

  let deleted = 0;
  let errors = 0;
  const stalePoizonIds = stale.map((r) => r.poizon_id);

  for (let i = 0; i < stalePoizonIds.length; i += DELETE_BATCH_SIZE) {
    const batch = stalePoizonIds.slice(i, i + DELETE_BATCH_SIZE);
    try {
      await deleteBatch(batch);
      deleted += batch.length;
    } catch (e) {
      errors += batch.length;
      console.error(
        `[purge-stale] Batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1} failed:`,
        (e as Error).message,
      );
    }

    if (
      i + DELETE_BATCH_SIZE >= stalePoizonIds.length ||
      (i + DELETE_BATCH_SIZE) % (DELETE_BATCH_SIZE * 5) === 0
    ) {
      console.log(
        `[purge-stale] Progress: ${Math.min(i + DELETE_BATCH_SIZE, stalePoizonIds.length)}/${stalePoizonIds.length} deleted=${deleted} errors=${errors}`,
      );
    }

    if (i + DELETE_BATCH_SIZE < stalePoizonIds.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log("\n[purge-stale] Done!");
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((e) => {
  console.error("[purge-stale] Critical error:", e);
  process.exit(1);
});
