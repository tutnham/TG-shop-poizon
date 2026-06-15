import type { SizePricesMap } from "@poizon-shop/shared";
import { getSupabase } from "./client.js";

export type CartItemRow = {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    name_ru: string | null;
    brand: string | null;
    image_urls: string[] | null;
    price_rub: number;
    price_usdt: number;
    price_cny: number | null;
    size_prices: SizePricesMap;
    is_available: boolean;
    stock: Record<string, boolean>;
  };
};

export async function getCartItems(userId: string): Promise<CartItemRow[]> {
  const { data, error } = await getSupabase()
    .from("cart_items")
    .select(
      `id, product_id, size, quantity,
      product:products(id, name, name_ru, brand, image_urls, price_rub, price_usdt, price_cny, size_prices, is_available, stock)`,
    )
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CartItemRow[];
}

export async function addCartItem(
  userId: string,
  productId: string,
  size: string,
  quantity: number,
): Promise<void> {
  const { data: existing, error: findError } = await getSupabase()
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("size", size)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (existing) {
    const nextQty = Math.min(10, existing.quantity + quantity);
    const { error } = await getSupabase()
      .from("cart_items")
      .update({ quantity: nextQty })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await getSupabase().from("cart_items").insert({
    user_id: userId,
    product_id: productId,
    size,
    quantity,
  });
  if (error) throw new Error(error.message);
}

export async function updateCartItem(
  itemId: string,
  userId: string,
  patch: { quantity?: number; size?: string },
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("cart_items")
    .update(patch)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function deleteCartItem(
  itemId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("cart_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function clearCart(userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("cart_items")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
