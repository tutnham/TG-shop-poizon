import { getEnvOptional } from "../types/env.types.js";

export async function sendShopMessage(
  telegramId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<boolean> {
  const token = getEnvOptional("SHOP_BOT_TOKEN");
  if (!token) {
    console.warn(
      `[notification] SHOP_BOT_TOKEN not set, cannot send to ${telegramId}`,
    );
    return false;
  }

  const body: Record<string, unknown> = {
    chat_id: telegramId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function sendAdminMessage(
  telegramId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<boolean> {
  const token = getEnvOptional("ADMIN_BOT_TOKEN");
  if (!token) {
    console.warn(
      `[notification] ADMIN_BOT_TOKEN not set, cannot send to ${telegramId}`,
    );
    return false;
  }

  const body: Record<string, unknown> = {
    chat_id: telegramId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export async function notifyCartUpdate(
  telegramId: number,
  items: Array<{
    name: string;
    brand?: string | null;
    size: string;
    quantity: number;
    price_rub: number;
  }>,
  totalRub: number,
  totalUsdt: number,
): Promise<void> {
  if (items.length === 0) {
    await sendShopMessage(telegramId, "🛒 Корзина пуста");
    return;
  }

  const lines: string[] = ["<b>🛒 Ваша корзина</b>", ""];

  for (const item of items) {
    const brand = item.brand ? ` (${item.brand})` : "";
    lines.push(
      `• ${item.name}${brand} — размер ${item.size}, кол-во ${item.quantity}, ${item.price_rub} ₽`,
    );
  }

  lines.push(
    "",
    `<b>Итого:</b> ${totalRub} ₽ / ${totalUsdt} USDT`,
    "",
    "Нажмите кнопку ниже, чтобы оформить заказ:",
  );

  const webappUrl = getEnvOptional("WEBAPP_URL", "https://example.com");
  const keyboard = {
    inline_keyboard: [
      [{ text: "📦 Оформить заказ", web_app: { url: `${webappUrl}/#/cart` } }],
      [{ text: "🛍 Открыть каталог", web_app: { url: webappUrl } }],
    ],
  };

  await sendShopMessage(telegramId, lines.join("\n"), keyboard);
}

export async function notifyAdminNewOrder(params: {
  shortId: string;
  customerName: string;
  customerPhone: string;
  customerTelegramId?: number;
  customerUsername?: string;
  items: Array<{
    product_id: string;
    name: string;
    brand?: string | null;
    size: string;
    quantity: number;
    price_rub: number;
  }>;
  totalRub: number;
  paymentMethod: string;
  deliveryAddress?: string;
}): Promise<void> {
  const {
    shortId,
    customerName,
    customerPhone,
    customerTelegramId,
    customerUsername,
    items,
    totalRub,
    paymentMethod,
    deliveryAddress,
  } = params;

  const PAYMENT_LABELS: Record<string, string> = {
    ton: "TON",
    rub_manual: "RUB (вручную)",
    usdt_manual: "USDT (вручную)",
  };

  const webappUrl = getEnvOptional("WEBAPP_URL", "https://example.com");

  const lines: string[] = [
    `<b>🛍 Новый заказ #${shortId}</b>`,
    "",
    `<b>Покупатель:</b> ${customerName}`,
    `<b>Телефон:</b> ${customerPhone}`,
  ];

  // Telegram контакт для связи менеджера
  if (customerUsername) {
    lines.push(`<b>Telegram:</b> @${customerUsername}`);
  } else if (customerTelegramId) {
    lines.push(`<b>Telegram ID:</b> <code>${customerTelegramId}</code>`);
  }

  if (deliveryAddress) {
    lines.push(`<b>Адрес:</b> ${deliveryAddress}`);
  }

  lines.push("", "<b>Товары:</b>");

  for (const item of items) {
    const brand = item.brand ? ` (${item.brand})` : "";
    const productLink = `${webappUrl}/#/product/${item.product_id}`;
    lines.push(
      `• <a href="${productLink}">${item.name}</a>${brand} — размер ${item.size}, кол-во ${item.quantity}, ${item.price_rub} ₽`,
    );
  }

  lines.push(
    "",
    `<b>Итого:</b> ${totalRub} ₽`,
    `<b>Оплата:</b> ${PAYMENT_LABELS[paymentMethod] ?? paymentMethod}`,
  );

  const text = lines.join("\n");

  // Клавиатура с быстрыми действиями по заказу
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Подтвердить", callback_data: `ord:cf:byshort:${shortId}` },
        { text: "❌ Отмена", callback_data: `ord:cx:byshort:${shortId}` },
      ],
    ],
  };

  // Отправляем уведомление всем администраторам через Admin Bot
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
      await sendAdminMessage(adminId, text, keyboard);
    } catch (err) {
      console.error(
        `[notification] failed to notify admin ${adminId} about order`,
        err,
      );
    }
  }
}
