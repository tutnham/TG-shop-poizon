export interface ProductListItem {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  price_rub: number;
  price_usdt: number;
  is_available: boolean;
  sold_count: number;
  synced_at?: string | null;
}

export type SizePrice = {
  cny: number;
  rub: number;
  usdt: number;
};

export type SizePricesMap = Record<string, SizePrice>;

export interface ProductDetail extends ProductListItem {
  name_ru: string | null;
  image_urls: string[];
  sizes: Record<string, string[]>;
  stock: Record<string, boolean>;
  size_prices: SizePricesMap;
  price_cny: number | null;
  category_id: string | null;
}

export interface Category {
  id: string;
  name: string;
  name_ru: string;
  slug: string;
}
