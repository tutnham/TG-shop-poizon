import { getEnvOptional } from "../types/env.types.js";

export async function sendShopMessage(
  telegramId: number,
  text: string,
): Promise<boolean> {
  const token = getEnvOptional("SHOP_BOT_TOKEN");
  if (!token) {
    console.warn(
      `[notification] SHOP_BOT_TOKEN not set, cannot send to ${telegramId}`,
    );
    return false;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId, text, parse_mode: "HTML" }),
  });
  return res.ok;
}

const STATUS_MESSAGES: Record<string, { ru: string; en: string }> = {
  confirmed: {
    ru: "✅ Заказ подтверждён",
    en: "✅ Order confirmed",
  },
  paid: {
    ru: "💰 Оплата получена",
    en: "💰 Payment received",
  },
  shipped: {
    ru: "📦 Заказ отправлен",
    en: "📦 Order shipped",
  },
  delivered: {
    ru: "🎉 Заказ доставлен",
    en: "🎉 Order delivered",
  },
  cancelled: {
    ru: "❌ Заказ отменён",
    en: "❌ Order cancelled",
  },
};

export async function notifyOrderStatus(
  telegramId: number,
  status: string,
  orderShortId: string,
  tracking?: string,
  lang = "ru",
): Promise<void> {
  const msg = STATUS_MESSAGES[status];
  if (!msg) return;
  const text = lang === "en" ? msg.en : msg.ru;
  let body = `${text}\n\n#${orderShortId}`;
  if (tracking) body += `\n\nTrack: ${tracking}`;
  await sendShopMessage(telegramId, body);
}

export async function notifyAdminNewOrder(params: {
  shortId: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    name: string;
    brand?: string | null;
    size: string;
    quantity: number;
    price_rub: number;
  }>;
  totalRub: number;
  paymentMethod: string;
}): Promise<void> {
  const {
    shortId,
    customerName,
    customerPhone,
    items,
    totalRub,
    paymentMethod,
  } = params;

  const PAYMENT_LABELS: Record<string, string> = {
    ton: "TON",
    rub_manual: "RUB (вручную)",
    usdt_manual: "USDT (вручную)",
  };

  const lines: string[] = [
    `<b>🛍 Новый заказ #${shortId}</b>`,
    "",
    `<b>Покупатель:</b> ${customerName}`,
    `<b>Телефон:</b> ${customerPhone}`,
    "",
    "<b>Товары:</b>",
  ];

  for (const item of items) {
    const brand = item.brand ? ` (${item.brand})` : "";
    lines.push(
      `• ${item.name}${brand} — размер ${item.size}, кол-во ${item.quantity}, ${item.price_rub} ₽`,
    );
  }

  lines.push(
    "",
    `<b>Итого:</b> ${totalRub} ₽`,
    `<b>Оплата:</b> ${PAYMENT_LABELS[paymentMethod] ?? paymentMethod}`,
  );

  const text = lines.join("\n");

  // Отправляем уведомление всем администраторам
  const { getAdminTelegramIds } = await import("../db/config.repository.js");
  const adminIds = await getAdminTelegramIds();
  if (adminIds.length === 0) {
    console.warn(
      "[notification] no admin telegram ids configured, skipping new order notification",
    );
    return;
  }

  for (const adminId of adminIds) {
    try {
      await sendShopMessage(adminId, text);
    } catch (err) {
      console.error(
        `[notification] failed to notify admin ${adminId} about order`,
        err,
      );
    }
  }
}
