import { getEnvOptional } from "../types/env.types.js";

export async function sendShopMessage(
  telegramId: number,
  text: string,
): Promise<boolean> {
  const token = getEnvOptional("SHOP_BOT_TOKEN");
  if (!token) {
    console.log(`[notification] ${telegramId}: ${text}`);
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
