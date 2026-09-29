import type { Buffer as NodeBuffer } from "node:buffer";
import type ExcelJS from "exceljs";
import { getSupabase } from "../db/client.js";
import { getEnvOptional } from "../types/env.types.js";

export type EmbeddedImage = { buffer: NodeBuffer; extension: string };

export const IMAGE_BUCKET = "product-images";

const MAX_IMAGES_PER_PRODUCT_FALLBACK = 8;
const MAX_IMAGE_BYTES_FALLBACK = 4 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 5;

export function maxImagesPerProduct(): number {
  const raw = Number.parseInt(
    getEnvOptional("EXCEL_IMPORT_MAX_IMAGES_PER_PRODUCT"),
    10,
  );
  return Number.isFinite(raw) && raw > 0
    ? raw
    : MAX_IMAGES_PER_PRODUCT_FALLBACK;
}

export function maxImageBytes(): number {
  const raw = Number.parseInt(
    getEnvOptional("EXCEL_IMPORT_MAX_IMAGE_BYTES"),
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : MAX_IMAGE_BYTES_FALLBACK;
}

/**
 * Извлекает изображения, вставленные поверх ячеек листа, и группирует их
 * по номерам строк (якорь tl, 0-based → rowNum). Строка заголовка игнорируется.
 */
export function extractEmbeddedImages(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
): Map<number, EmbeddedImage[]> {
  const byRow = new Map<number, { col: number; image: EmbeddedImage }[]>();
  const maxBytes = maxImageBytes();

  for (const { imageId, range } of sheet.getImages()) {
    const media = workbook.getImage(Number(imageId));
    if (!media) continue;
    // exceljs объявляет собственный тип Buffer; runtime — Node Buffer
    const buffer = (media.buffer ??
      (media.base64 ? Buffer.from(media.base64, "base64") : undefined)) as
      | NodeBuffer
      | undefined;
    if (!buffer?.length || buffer.length > maxBytes) continue;

    const tl = range?.tl;
    if (!tl) continue;
    const rowNum = Math.floor(tl.row) + 1;
    if (rowNum < 2) continue;

    const entry = {
      col: tl.col ?? 0,
      image: { buffer, extension: media.extension },
    };
    const list = byRow.get(rowNum);
    if (list) list.push(entry);
    else byRow.set(rowNum, [entry]);
  }

  const limit = maxImagesPerProduct();
  const result = new Map<number, EmbeddedImage[]>();
  for (const [rowNum, entries] of byRow) {
    entries.sort((a, b) => a.col - b.col);
    result.set(
      rowNum,
      entries.slice(0, limit).map((e) => e.image),
    );
  }
  return result;
}

function sanitizePathPart(raw: string): string {
  return (
    raw
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "unknown"
  );
}

function contentType(extension: string): string {
  switch (extension) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

export async function ensureImageBucket(): Promise<void> {
  const supabase = getSupabase();
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === IMAGE_BUCKET)) return;
  const { error } = await supabase.storage.createBucket(IMAGE_BUCKET, {
    public: true,
  });
  // Гонка createBucket (уже создан) не критична — проверим на загрузке
  if (error && !/already exists|duplicate/i.test(error.message)) {
    console.warn(`[excel-import] bucket create failed: ${error.message}`);
  }
}

/** Загружает фото товара в Supabase Storage и возвращает публичные URL. */
export async function uploadProductImages(
  article: string,
  images: EmbeddedImage[],
): Promise<string[]> {
  if (images.length === 0) return [];
  const supabase = getSupabase();
  const folder = `excel-import/${sanitizePathPart(article)}`;

  const paths = images.map((img, i) => ({
    path: `${folder}/${i}.${img.extension === "jpeg" ? "jpg" : img.extension}`,
    img,
  }));

  const urls: (string | null)[] = new Array(paths.length).fill(null);
  for (let start = 0; start < paths.length; start += UPLOAD_CONCURRENCY) {
    const chunk = paths.slice(start, start + UPLOAD_CONCURRENCY);
    await Promise.all(
      chunk.map(async ({ path, img }, offset) => {
        const { data, error } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(path, new Uint8Array(img.buffer), {
            contentType: contentType(img.extension),
            upsert: true,
          });
        if (error || !data?.path) {
          console.warn(
            `[excel-import] image upload failed (${path}):`,
            error?.message,
          );
          return;
        }
        const { data: pub } = supabase.storage
          .from(IMAGE_BUCKET)
          .getPublicUrl(data.path);
        urls[start + offset] = pub.publicUrl;
      }),
    );
  }
  return urls.filter((u): u is string => Boolean(u));
}
