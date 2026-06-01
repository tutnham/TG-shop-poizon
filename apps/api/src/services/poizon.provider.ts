export interface PoisonProductRaw {
  spuId: number;
  title: string;
  brand: string;
  logoUrl: string;
  priceFen: number;
  inStock: boolean;
  images: string[];
  sizes: Record<string, boolean>;
  soldCount: number;
}

export interface IPoisonProvider {
  searchProducts(
    keyword: string,
    limit: number,
    page: number,
  ): Promise<{
    items: PoisonProductRaw[];
    hasMore: boolean;
    total: number;
  }>;
  getProductDetail(spuId: number): Promise<PoisonProductRaw | null>;
  getCategories(
    lang: "RU" | "EN" | "ZH",
  ): Promise<{ id: number; name: string }[]>;
}
