import { getEnvOptional } from "../types/env.types.js";
import { withCache } from "./cache.service.js";
import { parsePoizonDetailResponse } from "./poizon-detail.parser.js";
import type { IPoisonProvider, PoisonProductRaw } from "./poizon.provider.js";

const NOT_CONFIGURED =
  "Poizon official API not configured. Set POIZON_OFFICIAL_API_URL and POIZON_OFFICIAL_API_KEY, or use POIZON_PROVIDER=poparce|mock.";

const PLACEHOLDER_HOSTS = new Set(["api.poizon-api.example"]);

/**
 * Провайдер для https://github.com/Poizon-API/public-api (poizon-api.com).
 * Использует OpenAPI-эндпоинты: /searchProducts, /productDetailWithPrice, /getCategories.
 * Аутентификация через заголовок x-api-key.
 */
export class PoizonOfficialProvider implements IPoisonProvider {
  private baseUrl(): string {
    return getEnvOptional(
      "POIZON_OFFICIAL_API_URL",
      "https://poizon-api.com/api/dewu",
    );
  }

  private apiKey(): string | undefined {
    return getEnvOptional("POIZON_OFFICIAL_API_KEY");
  }

  private ensureConfigured(): void {
    const key = this.apiKey();
    let host = "";
    try {
      host = new URL(this.baseUrl()).host;
    } catch {
      host = this.baseUrl();
    }
    if (!key || PLACEHOLDER_HOSTS.has(host)) {
      throw new Error(NOT_CONFIGURED);
    }
  }

  private async fetch<T>(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const key = this.apiKey();
    if (!key) throw new Error(NOT_CONFIGURED);

    const url = new URL(`${this.baseUrl()}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Poizon API error: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
      );
    }
    return res.json() as Promise<T>;
  }

  // -----------------------------------------------------------------------
  // searchProducts
  // -----------------------------------------------------------------------
  async searchProducts(
    keyword: string,
    limit: number,
    page: number,
  ): Promise<{
    items: PoisonProductRaw[];
    hasMore: boolean;
    total: number;
  }> {
    this.ensureConfigured();
    return withCache(
      `official-search:${keyword}:${limit}:${page}`,
      15 * 60,
      async () => {
        const data = await this.fetch<{
          total: number;
          page: number;
          lastId: string;
          productList: Array<{
            title: string;
            spuId: number;
            logoUrl: string;
            images: string[];
            articleNumber: string;
          }>;
        }>("/searchProducts", { keyword, limit, page });

        const items: PoisonProductRaw[] = (data.productList ?? []).map((p) => ({
          spuId: p.spuId,
          title: p.title,
          englishTitle: p.title,
          brand: p.title.split(" ")[0] ?? "Unknown",
          logoUrl: p.logoUrl,
          priceFen: 0,
          inStock: true,
          images: p.images?.length ? p.images : [p.logoUrl],
          sizes: {},
          sizePricesFen: {},
          soldCount: 0,
          articleNumber: p.articleNumber || undefined,
        }));

        const total = data.total ?? items.length;
        const hasMore = (page + 1) * limit < total;
        return { items, hasMore, total };
      },
    );
  }

  // -----------------------------------------------------------------------
  // getProductDetail (через productDetailWithPrice)
  // -----------------------------------------------------------------------
  async getProductDetail(spuId: number): Promise<PoisonProductRaw | null> {
    this.ensureConfigured();
    return withCache(`official-product:${spuId}`, 30 * 60, async () => {
      const raw = await this.fetch<unknown>("/productDetailWithPrice", { spuId });
      return parsePoizonDetailResponse(raw, spuId);
    });
  }

  // -----------------------------------------------------------------------
  // getCategories
  // -----------------------------------------------------------------------
  async getCategories(
    lang: "RU" | "EN" | "ZH",
  ): Promise<{ id: number; name: string }[]> {
    this.ensureConfigured();
    return withCache(`official-categories:${lang}`, 24 * 60 * 60, async () => {
      const cats = await this.fetch<Array<{ id: number; name: string }>>(
        "/getCategories",
        { lang },
      );
      return cats ?? [];
    });
  }
}
