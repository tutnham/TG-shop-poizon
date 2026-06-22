import { randomBytes } from "node:crypto";
import type {
  OrderDetail,
  OrderListItem,
  OrderStatus,
  PaymentMethod,
} from "@poizon-shop/shared";
import { getSupabase } from "./client.js";

function generateShortId(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function createOrder(row: {
  user_id: string;
  items: unknown;
  total_rub: number;
  total_usdt: number;
  payment_method: PaymentMethod;
  delivery_info: unknown;
  payment?: {
    method: PaymentMethod;
    amount_display: number;
    amount_ton?: number;
    wallet_comment: string;
  } | null;
}): Promise<{ id: string; short_id: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const short_id = generateShortId();
    const payment =
      row.payment != null
        ? {
            ...row.payment,
            wallet_comment: `ORD-${short_id}`,
          }
        : null;

    const { data, error } = await getSupabase().rpc("create_shop_order", {
      p_user_id: row.user_id,
      p_items: row.items,
      p_total_rub: row.total_rub,
      p_total_usdt: row.total_usdt,
      p_payment_method: row.payment_method,
      p_delivery_info: row.delivery_info,
      p_short_id: short_id,
      p_payment: payment,
    });

    if (!error && data && typeof data === "object" && data !== null) {
      const parsed = data as { id?: string; short_id?: string };
      if (parsed.id && parsed.short_id) {
        return { id: parsed.id, short_id: parsed.short_id };
      }
    }

    if (error?.code !== "23505") {
      throw new Error(error?.message ?? "Order insert failed");
    }
  }
  throw new Error("Could not generate unique order id");
}

export async function deleteOrder(orderId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("orders")
    .delete()
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

export async function getOrderByShortId(
  shortId: string,
): Promise<{ id: string; status: string; total_rub: number } | null> {
  const { data, error } = await getSupabase()
    .from("orders")
    .select("id, status, total_rub")
    .eq("short_id", shortId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listOrdersByUser(
  userId: string,
): Promise<OrderListItem[]> {
  const { data, error } = await getSupabase()
    .from("orders")
    .select(
      "id, short_id, status, total_rub, total_usdt, payment_method, created_at, items",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((o) => ({
    id: o.id as string,
    short_id: o.short_id as string,
    status: o.status as OrderListItem["status"],
    total_rub: Number(o.total_rub),
    total_usdt: Number(o.total_usdt),
    payment_method: o.payment_method as PaymentMethod | null,
    created_at: o.created_at as string,
    items_count: Array.isArray(o.items) ? o.items.length : 0,
  }));
}

export async function getOrderById(
  orderId: string,
  userId?: string,
): Promise<OrderDetail | null> {
  let query = getSupabase().from("orders").select("*").eq("id", orderId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const items = data.items as OrderDetail["items"];
  return {
    id: data.id,
    short_id: data.short_id,
    status: data.status,
    total_rub: Number(data.total_rub),
    total_usdt: Number(data.total_usdt),
    payment_method: data.payment_method,
    created_at: data.created_at,
    items_count: items.length,
    items,
    delivery_info: data.delivery_info,
    tracking_number: data.tracking_number,
    admin_comment: data.admin_comment,
  };
}

export async function listOrdersAdmin(opts: {
  status?: OrderStatus;
  page: number;
  limit: number;
}): Promise<{ orders: Record<string, unknown>[]; total: number }> {
  let query = getSupabase().from("orders").select("*", { count: "exact" });
  if (opts.status) query = query.eq("status", opts.status);
  query = query.order("created_at", { ascending: false });
  const from = (opts.page - 1) * opts.limit;
  const { data, count, error } = await query.range(from, from + opts.limit - 1);
  if (error) throw new Error(error.message);
  return { orders: data ?? [], total: count ?? 0 };
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  extra?: { tracking_number?: string; admin_comment?: string },
): Promise<void> {
  const { error } = await getSupabase()
    .from("orders")
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

export async function getOrderStats(): Promise<{
  today: number;
  week: number;
  revenue_today: number;
}> {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();

  const { count: today } = await getSupabase()
    .from("orders")
    .select("*", { count: "exact", head: true })
    .gte("created_at", todayStart);

  const { count: week } = await getSupabase()
    .from("orders")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekStart);

  const { data: rev } = await getSupabase()
    .from("orders")
    .select("total_rub")
    .gte("created_at", todayStart)
    .in("status", ["paid", "processing", "shipped", "delivered"]);

  const revenue_today = (rev ?? []).reduce(
    (s, o) => s + Number(o.total_rub),
    0,
  );

  return { today: today ?? 0, week: week ?? 0, revenue_today };
}

export async function getOrderWithUser(orderId: string): Promise<{
  order: Record<string, unknown>;
  telegram_id: number | null;
} | null> {
  const { data: order, error } = await getSupabase()
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return null;
  let telegram_id: number | null = null;
  if (order.user_id) {
    const { data: user } = await getSupabase()
      .from("users")
      .select("telegram_id")
      .eq("id", order.user_id)
      .maybeSingle();
    telegram_id = user?.telegram_id ?? null;
  }
  return { order, telegram_id };
}
