import type { ProductDetail } from "@poizon-shop/shared";
import type { CartLineView } from "../components/cart-item-card.js";
import { isDemoProductId } from "../data/demo-products.js";

const STORAGE_KEY = "poizon_demo_cart";

export type DemoCartLine = {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  name: string;
  brand: string | null;
  image_url: string | null;
  price_rub: number;
  price_usdt: number;
};

let memoryLines: DemoCartLine[] | null = null;

function newLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `demo-line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseStored(raw: string | null): DemoCartLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DemoCartLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(lines: DemoCartLine[]): void {
  const json = JSON.stringify(lines);
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
}

function readLines(): DemoCartLine[] {
  if (memoryLines) return memoryLines.map((l) => ({ ...l }));

  let fromStorage: DemoCartLine[] = [];
  try {
    fromStorage = parseStored(localStorage.getItem(STORAGE_KEY));
    if (!fromStorage.length) {
      fromStorage = parseStored(sessionStorage.getItem(STORAGE_KEY));
    }
  } catch {
    fromStorage = [];
  }

  memoryLines = fromStorage;
  return memoryLines.map((l) => ({ ...l }));
}

function writeLines(lines: DemoCartLine[]): void {
  memoryLines = lines.map((l) => ({ ...l }));
  persist(memoryLines);
}

/** Поднять корзину из storage при старте приложения. */
export function initDemoCart(): void {
  memoryLines = null;
  readLines();
}

export function getDemoCartLines(): DemoCartLine[] {
  return readLines();
}

export function demoCartCount(): number {
  return readLines().reduce((s, l) => s + l.quantity, 0);
}

export function addDemoCartLine(
  product: ProductDetail,
  size: string,
  quantity: number,
): void {
  const lines = readLines();
  const idx = lines.findIndex(
    (l) => l.product_id === product.id && l.size === size,
  );
  if (idx >= 0) {
    const line = lines[idx];
    const next = lines.map((l, i) =>
      i === idx
        ? { ...l, quantity: Math.min(10, line.quantity + quantity) }
        : l,
    );
    writeLines(next);
    return;
  }
  writeLines([
    ...lines,
    {
      id: newLineId(),
      product_id: product.id,
      size,
      quantity,
      name: product.name,
      brand: product.brand,
      image_url: product.image_url,
      price_rub: product.price_rub,
      price_usdt: product.price_usdt,
    },
  ]);
}

export function updateDemoCartQuantity(lineId: string, quantity: number): void {
  const lines = readLines();
  if (quantity < 1) {
    writeLines(lines.filter((l) => l.id !== lineId));
    return;
  }
  const next = lines.map((l) =>
    l.id === lineId ? { ...l, quantity: Math.min(10, quantity) } : l,
  );
  if (!next.some((l) => l.id === lineId)) return;
  writeLines(next);
}

export function removeDemoCartLine(lineId: string): void {
  writeLines(readLines().filter((l) => l.id !== lineId));
}

export function removeDemoCartLineByProduct(
  productId: string,
  size: string,
): void {
  writeLines(
    readLines().filter(
      (l) => !(l.product_id === productId && l.size === size),
    ),
  );
}

export function demoLinesToCartView(): CartLineView[] {
  return readLines().map((l) => ({
    id: l.id,
    product_id: l.product_id,
    size: l.size,
    quantity: l.quantity,
    line_rub: l.price_rub * l.quantity,
    line_usdt: l.price_usdt * l.quantity,
    product: {
      name: l.name,
      image_url: l.image_url,
      price_rub: l.price_rub,
      price_usdt: l.price_usdt,
    },
  }));
}

export function isDemoCartLineId(id: string): boolean {
  return readLines().some((l) => l.id === id);
}

export function demoCartTotals(): { total_rub: number; total_usdt: number } {
  const lines = readLines();
  return {
    total_rub: lines.reduce((s, l) => s + l.price_rub * l.quantity, 0),
    total_usdt: lines.reduce((s, l) => s + l.price_usdt * l.quantity, 0),
  };
}

export function isDemoLine(item: CartLineView): boolean {
  return isDemoProductId(item.product_id) || isDemoCartLineId(item.id);
}
