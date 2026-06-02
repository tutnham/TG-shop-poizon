import type { ProductListItem } from "@poizon-shop/shared";

/** Префикс id для демо-карточек (не уходят в реальный API). */
export const DEMO_PRODUCT_ID_PREFIX = "00000000-0000-4000-8000-";

export function isDemoProductId(id: string): boolean {
  return id.startsWith(DEMO_PRODUCT_ID_PREFIX);
}

/** Примеры товаров для витрины на главной. */
export const DEMO_PRODUCTS: ProductListItem[] = [
  {
    id: `${DEMO_PRODUCT_ID_PREFIX}000000000001`,
    name: "Air Jordan 1 Retro High OG",
    brand: "Jordan",
    image_url:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=480&q=80",
    price_rub: 24_990,
    price_usdt: 268,
    is_available: true,
    sold_count: 120,
  },
  {
    id: `${DEMO_PRODUCT_ID_PREFIX}000000000002`,
    name: "Nike Dunk Low Panda",
    brand: "Nike",
    image_url:
      "https://images.unsplash.com/photo-1606107557195-0f27c5bff2c5?w=480&q=80",
    price_rub: 18_990,
    price_usdt: 203,
    is_available: true,
    sold_count: 89,
  },
];
