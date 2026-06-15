export interface PoisonProductRaw {
  spuId: number;
  /** Оригинальное название (часто CN) */
  title: string;
  /** Английское отображаемое название */
  englishTitle: string;
  brand: string;
  logoUrl: string;
  /** Минимальная цена SPU в фэнях (или min по SKU) */
  priceFen: number;
  inStock: boolean;
  images: string[];
  /** Размер → наличие */
  sizes: Record<string, boolean>;
  /** Размер → цена в фэнях */
  sizePricesFen: Record<string, number>;
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
