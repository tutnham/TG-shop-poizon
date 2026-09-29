/** Escape text for safe insertion into HTML templates */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape URL for use in src/href attributes */
export function escapeAttrUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return escapeHtml(parsed.href);
  } catch {
    return "";
  }
}

/** Нейтральная заглушка (серый квадрат с иконкой), когда у товара нет фото. */
const IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23eceef1'/%3E%3Cpath d='M150 250l40-50 30 35 45-60 55 75z' fill='%23c2c7cf'/%3E%3Ccircle cx='165' cy='165' r='22' fill='%23c2c7cf'/%3E%3C/svg%3E";

/** src для <img>: валидное фото товара или placeholder (товары без изображения). */
export function imageSrcOrPlaceholder(url: string | null | undefined): string {
  return escapeAttrUrl(url) || IMAGE_PLACEHOLDER;
}
