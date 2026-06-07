import { Bot, InlineKeyboard } from "grammy";
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
    await ctx.reply(
      "Добро пожаловать в Poizon Shop!\n\nОткройте магазин кнопкой ниже.",
      { reply_markup: kb },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply("/start — открыть магазин");
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
