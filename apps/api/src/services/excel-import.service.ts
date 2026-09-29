import ExcelJS from "exceljs";
import { getSupabase } from "../db/client.js";
import { getConfigValue } from "../db/config.repository.js";
import {
  fetchExistingPoizonIds,
  upsertProductsBatch,
} from "../db/product.repository.js";
import { getEnvOptional } from "../types/env.types.js";
import { refreshRates } from "./currency.service.js";
import {
  EXCEL_IMPORT_SOURCE,
  type ExcelField,
  type ExcelRowFields,
  type ExcelSkipReason,
  type ExcelUpsertRow,
  type RawExcelRow,
  mapExcelRowToUpsertRow,
  matchExcelHeaders,
} from "./excel-import.mapper.js";
import { createCategorySlug } from "./export3-import.mapper.js";
import { buildSyncPricingContext } from "./pricing.service.js";

/** Ошибка с кодом для бота + опциональные детали (например, найденные заголовки). */
export class ExcelImportError extends Error {
  readonly code: string;
  readonly details: string[];

  constructor(code: string, details: string[] = []) {
    super(code);
    this.name = "ExcelImportError";
    this.code = code;
    this.details = details;
  }
}

export type ExcelSkippedRow = {
  rowNum: number;
  article: string | null;
  reason: ExcelSkipReason;
};

export type ExcelImportStats = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  duplicates: number;
  errors: number;
  skipDetails: ExcelSkippedRow[];
};

const DEFAULT_MAX_ROWS = 2000;

function maxRows(): number {
  const raw = Number.parseInt(getEnvOptional("EXCEL_IMPORT_MAX_ROWS"), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_ROWS;
}

function defaultCurrency(): "CNY" | "RUB" {
  return getEnvOptional("EXCEL_IMPORT_DEFAULT_CURRENCY", "CNY")
    .trim()
    .toLowerCase() === "rub"
    ? "RUB"
    : "CNY";
}

function requireImages(): boolean {
  return getEnvOptional("EXCEL_IMPORT_REQUIRE_IMAGES") === "true";
}

type CellValueLike =
  | string
  | number
  | Date
  | { richText?: { text: string }[] }
  | { text?: string; hyperlink?: string }
  | { formula?: string; result?: unknown }
  | { error?: string }
  | null
  | undefined;

function cellText(value: CellValueLike): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join("");
    }
    if ("result" in value && value.result != null) {
      return cellText(value.result as CellValueLike);
    }
    if ("text" in value && value.text != null) {
      return String(value.text);
    }
  }
  return "";
}

function cellHyperlink(value: CellValueLike): string | undefined {
  if (
    value != null &&
    typeof value === "object" &&
    "hyperlink" in value &&
    typeof value.hyperlink === "string"
  ) {
    return value.hyperlink;
  }
  return undefined;
}

/** Читает первый лист: заголовки + строки, сопоставленные полям по алиасам. */
export async function parseExcelWorkbook(
  buffer: Uint8Array,
  aliasOverrides: Partial<Record<ExcelField, string[]>> = {},
): Promise<{ headers: (string | null)[]; rows: RawExcelRow[] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw new ExcelImportError("FILE_CORRUPT");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    throw new ExcelImportError("EMPTY_FILE");
  }

  const headerRow = sheet.getRow(1);
  const headers: (string | null)[] = [];
  for (let col = 1; col <= sheet.columnCount; col++) {
    const text = cellText(headerRow.getCell(col).value as CellValueLike).trim();
    headers.push(text || null);
  }

  const { mapping } = matchExcelHeaders(headers, aliasOverrides);
  if (mapping.article == null || mapping.price == null) {
    throw new ExcelImportError(
      "HEADERS_UNRECOGNIZED",
      headers.filter((h): h is string => Boolean(h)),
    );
  }

  const rows: RawExcelRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const fields: ExcelRowFields = {};
    let hasData = false;
    for (const [field, col] of Object.entries(mapping) as [
      ExcelField,
      number,
    ][]) {
      const cell = row.getCell(col + 1);
      const text = cellText(cell.value as CellValueLike).trim();
      const hyperlink = cellHyperlink(cell.value as CellValueLike);
      if (text || hyperlink) hasData = true;
      fields[field] = hyperlink ? { text, hyperlink } : { text };
    }
    if (hasData) rows.push({ rowNum, fields });
  });

  if (rows.length === 0) throw new ExcelImportError("EMPTY_FILE");
  if (rows.length > maxRows()) throw new ExcelImportError("TOO_MANY_ROWS");

  return { headers, rows };
}

async function ensureCategories(names: string[]): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const supabase = getSupabase();

  for (const name of names) {
    const slug = createCategorySlug(name);
    if (!slug) continue;

    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing?.id) {
      byName.set(name, existing.id as string);
      continue;
    }

    const { data: created, error } = await supabase
      .from("categories")
      .insert({ name, name_ru: name, slug })
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn(
        `[excel-import] category "${name}" create failed:`,
        error.message,
      );
      continue;
    }
    if (created?.id) byName.set(name, created.id as string);
  }

  return byName;
}

export async function importProductsFromExcel(
  buffer: Uint8Array,
): Promise<ExcelImportStats> {
  const aliasOverrides = await getConfigValue<
    Partial<Record<ExcelField, string[]>>
  >("excel_import_mapping", {});

  const { rows } = await parseExcelWorkbook(buffer, aliasOverrides);

  // Dedupe по артикулу: last-wins (Supabase не принимает дубли conflict key в одном upsert)
  const byArticle = new Map<string, RawExcelRow>();
  const skipDetails: ExcelSkippedRow[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const article = row.fields.article?.text.trim() ?? "";
    if (!article) {
      skipDetails.push({
        rowNum: row.rowNum,
        article: null,
        reason: "no_article",
      });
      continue;
    }
    if (byArticle.has(article)) duplicates++;
    byArticle.set(article, row);
  }

  const categoryNames = [
    ...new Set(
      rows.map((row) => row.fields.category?.text.trim() ?? "").filter(Boolean),
    ),
  ];
  const categoryIdByName = await ensureCategories(categoryNames);

  await refreshRates(false);
  const pricingCtx = await buildSyncPricingContext();

  const mapCtx = {
    pricingCtx,
    defaultCurrency: defaultCurrency(),
    requireImages: requireImages(),
    resolveCategoryId: (name: string) => categoryIdByName.get(name) ?? null,
  };

  const batch: ExcelUpsertRow[] = [];
  for (const row of byArticle.values()) {
    const result = mapExcelRowToUpsertRow(row, mapCtx);
    if (result.status === "skipped") {
      skipDetails.push({
        rowNum: row.rowNum,
        article: row.fields.article?.text.trim() || null,
        reason: result.reason,
      });
      continue;
    }
    batch.push(result.row);
  }

  const articles = batch.map((row) => row.poizon_id);
  const existing = articles.length
    ? await fetchExistingPoizonIds(articles)
    : new Set<string>();

  let errors = 0;
  let inserted = 0;
  if (batch.length > 0) {
    const result = await upsertProductsBatch(batch, EXCEL_IMPORT_SOURCE);
    inserted = result.inserted;
    errors = result.errors;
  }

  const updatedCount = articles.filter((a) => existing.has(a)).length;
  const createdCount = Math.max(0, inserted - updatedCount);

  return {
    parsed: rows.length,
    created: createdCount,
    updated: inserted > 0 ? Math.min(updatedCount, inserted) : 0,
    skipped: skipDetails.length,
    duplicates,
    errors,
    skipDetails,
  };
}
