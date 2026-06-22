const SPU_ID_PATTERN = /^\d{5,}$/;
const ARTICLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_.]{2,50}$/;

function looksLikeUrl(input: string): boolean {
  return (
    /^https?:\/\//i.test(input) ||
    input.includes("dewu.com") ||
    input.includes("poizon.com") ||
    input.includes("m.dewu.com")
  );
}

/** Совпадает с серверным resolvePoizonRef — артикул, spuId или ссылка Poizon. */
export function looksLikeImportQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (SPU_ID_PATTERN.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return false;
  if (looksLikeUrl(trimmed)) return true;
  return ARTICLE_PATTERN.test(trimmed);
}
