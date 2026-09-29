export type CatalogProductIdentity = {
  id: string;
  poizon_id: string;
  source?: string | null;
};

/** Источники, которые участвуют в замене каталога Export3 (остальные не трогаем). */
const REPLACEABLE_SOURCES = new Set(["poizon", "user_import"]);

export function selectStaleProducts(
  dbProducts: CatalogProductIdentity[],
  keepSet: Set<string>,
  opts: { poizonOnly?: boolean } = {},
): CatalogProductIdentity[] {
  return dbProducts.filter((row) => {
    if (!row.poizon_id) return false;
    if (row.source != null && !REPLACEABLE_SOURCES.has(row.source))
      return false;
    if (opts.poizonOnly && row.source !== "poizon") return false;
    return !keepSet.has(row.poizon_id);
  });
}
