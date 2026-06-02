import type { ProductDetail, ProductListItem } from "@poizon-shop/shared";

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

const DEMO_DETAILS: Record<string, ProductDetail> = {
  [DEMO_PRODUCTS[0].id]: {
    ...DEMO_PRODUCTS[0],
    name_ru: DEMO_PRODUCTS[0].name,
    image_urls: [DEMO_PRODUCTS[0].image_url ?? ""],
    sizes: { EU: ["40", "41", "42", "43", "44"] },
    stock: { "40": true, "41": true, "42": true, "43": true, "44": false },
    price_cny: null,
    category_id: null,
  },
  [DEMO_PRODUCTS[1].id]: {
    ...DEMO_PRODUCTS[1],
    name_ru: DEMO_PRODUCTS[1].name,
    image_urls: [DEMO_PRODUCTS[1].image_url ?? ""],
    sizes: { EU: ["38", "39", "40", "41", "42"] },
    stock: { "38": true, "39": true, "40": true, "41": true, "42": true },
    price_cny: null,
    category_id: null,
  },
};

export function getDemoProductDetail(id: string): ProductDetail | null {
  return DEMO_DETAILS[id] ?? null;
}
