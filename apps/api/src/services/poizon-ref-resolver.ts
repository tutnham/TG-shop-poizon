export type PoizonRefKind = "spuId" | "article";

export type PoizonRef =
  | { kind: "spuId"; spuId: number }
  | { kind: "article"; keyword: string };

const SPU_ID_PATTERN = /^\d{5,}$/;
const ARTICLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_.]{2,50}$/;

function extractSpuIdFromUrl(input: string): number | null {
  const normalized = input.startsWith("http") ? input : `https://${input}`;

  try {
    const url = new URL(normalized);
    const fromQuery =
      url.searchParams.get("spuId") ??
      url.searchParams.get("spuid") ??
      url.searchParams.get("id");
    if (fromQuery && SPU_ID_PATTERN.test(fromQuery)) {
      return Number(fromQuery);
    }

    const pathMatch = url.pathname.match(/\/(\d{5,})(?:\/|$)/);
    if (pathMatch) return Number(pathMatch[1]);
  } catch {
    const queryMatch = input.match(/[?&]spuId=(\d{5,})/i);
    if (queryMatch) return Number(queryMatch[1]);
  }

  return null;
}

function looksLikeUrl(input: string): boolean {
  return (
    /^https?:\/\//i.test(input) ||
    input.includes("dewu.com") ||
    input.includes("poizon.com") ||
    input.includes("m.dewu.com")
  );
}

/** Parses user input into a Poizon spuId or article search keyword. */
export function resolvePoizonRef(query: string): PoizonRef | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  if (SPU_ID_PATTERN.test(trimmed)) {
    return { kind: "spuId", spuId: Number(trimmed) };
  }

  if (/^\d+$/.test(trimmed)) {
    return null;
  }

  if (looksLikeUrl(trimmed)) {
    const spuId = extractSpuIdFromUrl(trimmed);
    if (spuId != null) return { kind: "spuId", spuId };
    return null;
  }

  if (ARTICLE_PATTERN.test(trimmed)) {
    return { kind: "article", keyword: trimmed };
  }

  return null;
}
