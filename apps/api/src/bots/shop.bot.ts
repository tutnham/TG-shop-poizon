import { Bot, InlineKeyboard } from "grammy";
import { getSupabase } from "../db/client.js";
import * as orderRepo from "../db/order.repository.js";
import { getEnvOptional } from "../types/env.types.js";

let shopBot: Bot | null = null;
let initialized = false;

function getShopBot(): Bot | null {
  const token = getEnvOptional("SHOP_BOT_TOKEN");
  if (!token) return null;
  if (!shopBot) {
    shopBot = new Bot(token);
    setupShopBot(shopBot);
  }
  return shopBot;
}

function setupShopBot(bot: Bot): void {
  if (initialized) return;
  initialized = true;

  bot.command("start", async (ctx) => {
    const webappUrl = getEnvOptional("WEBAPP_URL", "https://example.com");
    const kb = new InlineKeyboard().webApp("🛍 Открыть магазин", webappUrl);
    const name = ctx.from?.first_name ? `, ${ctx.from.first_name}` : "";
    await ctx.reply(
      `Привет${name}! 👋\n\n` +
        "Добро пожаловать в <b>Poizon Shop</b> — магазин оригинальных кроссовок и одежды с доставкой по РФ и СНГ.\n\n" +
        "🔹 <b>Только оригинал</b> — проверка подлинности каждого товара\n" +
        "🔹 <b>Доставка 5–10 дней</b> — прямые поставки с Poizon\n" +
        "🔹 <b>Оплата</b> — согласовывается с менеджером после оформления заказа\n\n" +
        "Нажми кнопку ниже, чтобы открыть каталог 🛍",
      { reply_markup: kb, parse_mode: "HTML" },
    );
  });

  bot.command("shop", async (ctx) => {
    const webappUrl = getEnvOptional("WEBAPP_URL", "https://example.com");
    const kb = new InlineKeyboard().webApp("🛍 Открыть магазин", webappUrl);
    await ctx.reply("Нажмите кнопку, чтобы открыть каталог:", {
      reply_markup: kb,
    });
  });

  bot.command("orders", async (ctx) => {
    const webappUrl = getEnvOptional("WEBAPP_URL", "https://example.com");
    const ordersUrl = `${webappUrl}#/orders`;
    const kb = new InlineKeyboard()
      .webApp("📋 Мои заказы", ordersUrl)
      .row()
      .webApp("🛍 В каталог", webappUrl);
    await ctx.reply("Ваши заказы:", {
      reply_markup: kb,
    });
  });

  bot.command("help", async (ctx) => {
    const webappUrl = getEnvOptional("WEBAPP_URL", "https://example.com");
    const kb = new InlineKeyboard()
      .webApp("🛍 Открыть магазин", webappUrl)
      .row()
      .webApp("📋 Заказы", `${webappUrl}#/orders`);
    await ctx.reply(
      "<b>Справка Poizon Shop</b>\n\n" +
        "/start — главное меню и кнопка магазина\n" +
        "/shop — открыть каталог товаров\n" +
        "/orders — история ваших заказов\n" +
        "/help — эта справка\n\n" +
        "<b>Как оформить заказ:</b>\n" +
        "1. Откройте каталог кнопкой ниже\n" +
        "2. Выберите товар и размер\n" +
        "3. Добавьте в корзину\n" +
        "4. Оформите заказ, указав контакты\n" +
        "5. Выберите способ оплаты\n\n" +
        "<b>По вопросам доставки и оплаты</b> обращайтесь к менеджеру.",
      { reply_markup: kb, parse_mode: "HTML" },
    );
  });

  // Callback: открыть Mini App
  bot.callbackQuery("open_webapp", async (ctx) => {
    const webappUrl = getEnvOptional("WEBAPP_URL", "https://example.com");
    await ctx.answerCallbackQuery({ url: webappUrl });
  });

  // Callback: статус заказа (только если пользователь — владелец заказа)
  bot.callbackQuery(/^track_order:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1] ?? "";
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.answerCallbackQuery({ text: "Ошибка авторизации", show_alert: true });
      return;
    }
    // Получаем заказ с проверкой владельца
    const order = await orderRepo.getOrderById(orderId);
    if (!order) {
      await ctx.answerCallbackQuery({ text: "Заказ не найден", show_alert: true });
      return;
    }
    // Проверяем, что пользователь — владелец заказа (по telegram_id)
    // Для этого нужна доп. проверка через БД
    const { data: orderUser } = await getSupabase()
      .from("orders")
      .select("user_id")
      .eq("id", orderId)
      .maybeSingle();
    const { data: tgUser } = await getSupabase()
      .from("users")
      .select("id")
      .eq("telegram_id", userId)
      .maybeSingle();
    if (!orderUser || !tgUser || orderUser.user_id !== tgUser.id) {
      await ctx.answerCallbackQuery({ text: "Нет доступа к этому заказу", show_alert: true });
      return;
    }
    const statusLabels: Record<string, string> = {
      pending: "⏳ Ожидает подтверждения",
      confirmed: "✅ Подтверждён",
      paid: "💰 Оплачен",
      processing: "🔄 В обработке",
      shipped: "📦 Отправлен",
      delivered: "🎉 Доставлен",
      cancelled: "❌ Отменён",
    };
    const status = statusLabels[order.status] ?? order.status;
    let text = `Заказ #${order.short_id ?? order.id.slice(0, 8)}\nСтатус: ${status}`;
    if (order.tracking_number) {
      text += `\nТрек-номер: ${order.tracking_number}`;
    }
    await ctx.answerCallbackQuery({ text, show_alert: true });
  });

  bot.on("pre_checkout_query", async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    if (!payload?.startsWith("ORD-")) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: "Invalid order",
      });
      return;
    }
    const shortId = payload.slice(4);
    const order = await orderRepo.getOrderByShortId(shortId);
    if (!order || order.status !== "pending") {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: "Order not found or already paid",
      });
      return;
    }
    const expectedAmount = Math.round(Number(order.total_rub) * 100);
    if (ctx.preCheckoutQuery.total_amount !== expectedAmount) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: "Amount mismatch",
      });
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    await ctx.reply("Спасибо за оплату!");
  });
}

export async function handleShopUpdate(update: unknown): Promise<void> {
  const bot = getShopBot();
  if (!bot) {
    console.warn("[shop-bot] no SHOP_BOT_TOKEN");
    return;
  }
  await bot.handleUpdate(update as Parameters<Bot["handleUpdate"]>[0]);
}
