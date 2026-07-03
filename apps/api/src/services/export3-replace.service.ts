export type CatalogProductIdentity = {
  id: string;
  poizon_id: string;
  source?: string | null;
};

export function selectStaleProducts(
  dbProducts: CatalogProductIdentity[],
  keepSet: Set<string>,
  opts: { poizonOnly?: boolean } = {},
): CatalogProductIdentity[] {
  return dbProducts.filter((row) => {
    if (!row.poizon_id) return false;
    if (opts.poizonOnly && row.source !== "poizon") return false;
    return !keepSet.has(row.poizon_id);
  });
}
