import type { PaymentMethod } from "@poizon-shop/shared";
import { getSupabase } from "./client.js";

export async function createPayment(row: {
  order_id: string;
  method: PaymentMethod;
  amount_display: number;
  amount_ton?: number;
  wallet_comment: string;
}): Promise<string> {
  const { data, error } = await getSupabase()
    .from("payments")
    .insert({ ...row, status: "pending" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function confirmPayment(
  paymentId: string,
  adminTelegramId: number,
  tonTxHash?: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("payments")
    .update({
      status: "completed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: adminTelegramId,
      ton_tx_hash: tonTxHash ?? null,
    })
    .eq("id", paymentId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

export async function getPendingPaymentByOrder(
  orderId: string,
): Promise<{ id: string; method: string; status: string } | null> {
  const { data } = await getSupabase()
    .from("payments")
    .select("id, method, status")
    .eq("order_id", orderId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getPaymentsByOrder(orderId: string) {
  const { data } = await getSupabase()
    .from("payments")
    .select("*")
    .eq("order_id", orderId);
  return data ?? [];
}
