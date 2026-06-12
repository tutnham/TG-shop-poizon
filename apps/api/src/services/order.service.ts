import type { OrderStatus, PaymentMethod, Result } from "@poizon-shop/shared";
import type { CreateOrderSchema } from "@poizon-shop/shared";
import type { z } from "zod";
import * as cartRepo from "../db/cart.repository.js";
import { getConfigValue } from "../db/config.repository.js";
import * as orderRepo from "../db/order.repository.js";
import * as paymentRepo from "../db/payment.repository.js";
import { getUserById } from "../db/user.repository.js";
import { appError } from "../types/app-error.types.js";
import type { AppError } from "../types/app-error.types.js";
import { getEnvOptional } from "../types/env.types.js";
import { notifyAdminNewOrder } from "./notification.service.js";

export type CreateOrderSuccess = {
  order_id: string;
  short_id: string;
  payment: {
    wallet_comment?: string;
    ton_amount?: number;
    instructions?: string;
  };
};

export type CreateOrderResult =
  | { ok: true; data: CreateOrderSuccess }
  | { ok: false; error: AppError };

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled", "paid"],
  confirmed: ["paid", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  extra?: { tracking_number?: string },
): Promise<Result<void>> {
  const detail = await orderRepo.getOrderById(orderId);
  if (!detail) return { ok: false, error: appError("Order not found", 404) };
  if (!canTransition(detail.status, to)) {
    return {
      ok: false,
      error: appError(`Cannot move ${detail.status} → ${to}`, 400),
    };
  }
  await orderRepo.updateOrderStatus(orderId, to, extra);
  return { ok: true, data: undefined };
}

export async function createOrderFromCart(
  userId: string,
  body: z.infer<typeof CreateOrderSchema>,
): Promise<CreateOrderResult> {
  const cart = await cartRepo.getCartItems(userId);
  if (cart.length === 0) {
    return { ok: false, error: appError("Cart is empty", 400, "EMPTY_CART") };
  }

  for (const item of cart) {
    if (!item.product.is_available) {
      return { ok: false, error: appError("Product unavailable", 400) };
    }
    const stock = item.product.stock ?? {};
    if (stock[item.size] === false) {
      return {
        ok: false,
        error: appError(`Size ${item.size} unavailable`, 400),
      };
    }
  }

  const items = cart.map((item) => ({
    product_id: item.product_id,
    name: item.product.name_ru ?? item.product.name,
    brand: item.product.brand,
    size: item.size,
    quantity: item.quantity,
    price_rub: Number(item.product.price_rub) * item.quantity,
    price_usdt: Number(item.product.price_usdt) * item.quantity,
    image_url: item.product.image_urls?.[0] ?? null,
  }));

  const total_rub = items.reduce((s, i) => s + i.price_rub, 0);
  const total_usdt = items.reduce((s, i) => s + i.price_usdt, 0);

  const { id, short_id } = await orderRepo.createOrder({
    user_id: userId,
    items,
    total_rub,
    total_usdt,
    payment_method: body.payment_method,
    delivery_info: body.delivery_info,
  });

  const wallet_comment = `ORD-${short_id}`;
  let paymentMeta: {
    wallet_comment?: string;
    ton_amount?: number;
    instructions?: string;
  } = {};

  try {
    if (body.payment_method === "ton") {
      const tonRate = await getConfigValue<number>("ton_rate_usd", 2.5);
      const ton_amount = Math.ceil((total_usdt / tonRate) * 1000) / 1000;
      await paymentRepo.createPayment({
        order_id: id,
        method: "ton",
        amount_display: total_usdt,
        amount_ton: ton_amount,
        wallet_comment,
      });
      paymentMeta = { wallet_comment, ton_amount };
    } else if (body.payment_method === "rub_manual") {
      const instructions = await getConfigValue<string>(
        "payment_instructions_rub",
        "Оплата RUB: свяжитесь с менеджером.",
      );
      await paymentRepo.createPayment({
        order_id: id,
        method: "rub_manual",
        amount_display: total_rub,
        wallet_comment,
      });
      paymentMeta = { wallet_comment, instructions };
    } else {
      const instructions = await getConfigValue<string>(
        "payment_instructions_usdt",
        "USDT: укажите номер заказа в комментарии.",
      );
      await paymentRepo.createPayment({
        order_id: id,
        method: "usdt_manual",
        amount_display: total_usdt,
        wallet_comment,
      });
      paymentMeta = { wallet_comment, instructions };
    }

    await cartRepo.clearCart(userId);
  } catch (e) {
    await orderRepo.deleteOrder(id).catch(() => {});
    return {
      ok: false,
      error: appError(e instanceof Error ? e.message : "Order failed", 500),
    };
  }

  try {
    // Получаем данные пользователя для уведомления админа
    const user = await getUserById(userId);
    await notifyAdminNewOrder({
      shortId: short_id,
      customerName: body.delivery_info.full_name,
      customerPhone: body.delivery_info.phone,
      customerTelegramId: user?.telegram_id,
      customerUsername: user?.username ?? undefined,
      items,
      totalRub: total_rub,
      paymentMethod: body.payment_method,
      deliveryAddress: body.delivery_info.address,
    });
  } catch (err) {
    console.error("[order] admin notification failed", err);
  }

  return { ok: true, data: { order_id: id, short_id, payment: paymentMeta } };
}

export async function confirmManualPayment(
  orderId: string,
  method: PaymentMethod,
  adminTelegramId: number,
  tonTxHash?: string,
): Promise<Result<void>> {
  const order = await orderRepo.getOrderById(orderId);
  if (!order) return { ok: false, error: appError("Order not found", 404) };
  if (order.status === "cancelled") {
    return { ok: false, error: appError("Order cancelled", 400) };
  }
  if (order.status === "paid") {
    return { ok: true, data: undefined };
  }

  if (!canTransition(order.status, "paid")) {
    return {
      ok: false,
      error: appError(`Cannot mark ${order.status} as paid`, 400),
    };
  }

  const pending = await paymentRepo.getPendingPaymentByOrder(orderId);
  if (pending) {
    await paymentRepo.confirmPayment(pending.id, adminTelegramId, tonTxHash);
  }

  await orderRepo.updateOrderStatus(orderId, "paid");
  return { ok: true, data: undefined };
}

export function buildTonTransferLink(
  address: string,
  amountTon: number,
  comment: string,
): string {
  const addr = address || getEnvOptional("TON_WALLET_ADDRESS");
  if (!addr) return "https://t.me/wallet";
  const amountNano = Math.floor(amountTon * 1e9);
  return `https://t.me/wallet?startattach=transfer&address=${encodeURIComponent(addr)}&amount=${amountNano}&text=${encodeURIComponent(comment)}`;
}
