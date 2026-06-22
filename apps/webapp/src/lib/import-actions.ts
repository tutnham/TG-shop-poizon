import type { ProductDetail } from "@poizon-shop/shared";
import { apiPost, seedGetCache } from "../api/client.js";
import { t } from "../i18n/index.js";
import { navigate } from "../router.js";
import { haptic } from "../telegram.js";
import { showToast } from "./toast.js";

export class ProductImportError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProductImportError";
    this.status = status;
  }
}

export async function importProductByArticle(
  query: string,
): Promise<ProductDetail> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new ProductImportError(t("poizon_import_invalid"), 400);
  }

  try {
    const res = await apiPost<{ data: ProductDetail }>("/api/products/import", {
      query: trimmed,
    });
    return res.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : t("error");
    if (/rate limit/i.test(message)) {
      throw new ProductImportError(t("poizon_import_rate_limited"), 429);
    }
    if (/not found/i.test(message)) {
      throw new ProductImportError(t("poizon_import_not_found"), 404);
    }
    if (/invalid/i.test(message)) {
      throw new ProductImportError(t("poizon_import_invalid"), 400);
    }
    if (/import failed/i.test(message)) {
      throw new ProductImportError(t("poizon_import_not_found"), 500);
    }
    throw new ProductImportError(message, 500);
  }
}

export async function importAndOpenProduct(query: string): Promise<void> {
  const product = await importProductByArticle(query);
  seedGetCache(`/api/products/${product.id}`, { data: product });
  haptic("success");
  showToast(t("poizon_import_success"));
  navigate(`/product/${product.id}`);
}
