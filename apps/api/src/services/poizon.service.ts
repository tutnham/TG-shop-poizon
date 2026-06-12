import { getEnvOptional } from "../types/env.types.js";
import { withCache } from "./cache.service.js";
import { PoizonOfficialProvider } from "./poizon-official.provider.js";
import type { IPoisonProvider, PoisonProductRaw } from "./poizon.provider.js";

const BASE_URL = () =>
  getEnvOptional("POIZON_API_BASE_URL", "https://poparce.ru/api/dewu");
const API_KEY = () => getEnvOptional("POIZON_API_KEY");

async function poisonFetch<T>(
  path: string,
  params?: Record<string, string | number>,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<T> {
  const key = API_KEY();
  if (!key) throw new Error("POIZON_API_KEY not configured");

  const url = new URL(`${BASE_URL()}${path}`);
  if (params && method === "GET") {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Poizon API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function mapDetail(raw: {
  detail: {
    spuId: number;
    title: string;
    logoUrl: string;
    status: number;
    soldCountText?: string;
  };
  price: { item: { price: number } };
  image?: { spuImage?: { images?: Array<{ url: string }> } };
}): PoisonProductRaw {
  const images = raw.image?.spuImage?.images?.map((i) => i.url) ?? [
    raw.detail.logoUrl,
  ];
  return {
    spuId: raw.detail.spuId,
    title: raw.detail.title,
    brand: raw.detail.title.split(" ")[0] ?? "Unknown",
    logoUrl: raw.detail.logoUrl,
    priceFen: raw.price.item.price,
    inStock: raw.detail.status === 1,
    images,
    sizes: {},
    soldCount: Number.parseInt(raw.detail.soldCountText ?? "0", 10) || 0,
  };
}

export class PoparcePoisonProvider implements IPoisonProvider {
  async searchProducts(
    keyword: string,
    limit: number,
    page: number,
  ): Promise<{ items: PoisonProductRaw[]; hasMore: boolean; total: number }> {
    return withCache(
      `search:${keyword}:${limit}:${page}`,
      15 * 60,
      async () => {
        const data = await poisonFetch<{
          spuList?: Array<{
            spuId: number;
            title: string;
            logoUrl: string;
            price: number;
            soldCountText?: string;
          }>;
          productList?: Array<{
            spuId: number;
            title: string;
            logoUrl: string;
            price: number;
            soldCountText?: string;
          }>;
          list?: Array<{
            spuId: number;
            title: string;
            logoUrl: string;
            price: number;
            soldCountText?: string;
          }>;
          hasMore?: boolean;
          total?: number;
        }>("/searchProducts", { keyword, limit, page });

        // Автоопределение формата ответа: spuList | productList | list
        const sourceList = data.spuList ?? data.productList ?? data.list ?? [];

        const items = sourceList.map((s) => ({
          spuId: s.spuId,
          title: s.title,
          brand: s.title.split(" ")[0] ?? "Unknown",
          logoUrl: s.logoUrl,
          priceFen: s.price,
          inStock: true,
          images: [s.logoUrl],
          sizes: {},
          soldCount: Number.parseInt(s.soldCountText ?? "0", 10) || 0,
        }));

        const total = data.total ?? items.length;
        const hasMore = data.hasMore ?? ((page + 1) * limit < total);
        return { items, hasMore, total };
      },
    );
  }

  async getProductDetail(spuId: number): Promise<PoisonProductRaw | null> {
    return withCache(`product:${spuId}`, 30 * 60, async () => {
      const raw = await poisonFetch<Parameters<typeof mapDetail>[0]>(
        "/productDetailWithPrice",
        { spuId },
      );
      return mapDetail(raw);
    });
  }

  async getCategories(
    lang: "RU" | "EN" | "ZH",
  ): Promise<{ id: number; name: string }[]> {
    return withCache(`categories:${lang}`, 24 * 60 * 60, async () => {
      const cats = await poisonFetch<Array<{ id: number; name: string }>>(
        "/getCategories",
        {
          lang,
        },
      );
      return cats;
    });
  }
}

export class MockPoisonProvider implements IPoisonProvider {
  async searchProducts(keyword: string, limit: number, page: number) {
    return {
      items: [
        {
          spuId: 100001,
          title: `Mock ${keyword}`,
          brand: "Nike",
          logoUrl:
            "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
          priceFen: 45000,
          inStock: true,
          images: [
            "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
          ],
          sizes: { "42": true },
          soldCount: 100,
        },
      ],
      hasMore: false,
      total: 1,
    };
  }

  async getProductDetail(spuId: number) {
    return {
      spuId,
      title: "Mock Product",
      brand: "Nike",
      logoUrl:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
      priceFen: 45000,
      inStock: true,
      images: [
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
      ],
      sizes: { "42": true },
      soldCount: 50,
    };
  }

  async getCategories() {
    return [{ id: 1, name: "Sneakers" }];
  }
}

export function getPoisonProvider(): IPoisonProvider {
  const provider = getEnvOptional("POIZON_PROVIDER", "").toLowerCase();
  switch (provider) {
    case "official":
      return new PoizonOfficialProvider();
    case "poparce":
      return new PoparcePoisonProvider();
    case "mock":
      return new MockPoisonProvider();
    default:
      if (API_KEY()) return new PoparcePoisonProvider();
      return new MockPoisonProvider();
  }
}
