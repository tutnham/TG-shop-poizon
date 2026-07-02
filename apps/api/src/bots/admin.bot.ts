import type { OrderStatus, PaymentMethod } from "@poizon-shop/shared";
import { Bot, InlineKeyboard } from "grammy";
import { getAdminTelegramIds } from "../db/config.repository.js";
import * as orderRepo from "../db/order.repository.js";
import { refreshRates } from "../services/currency.service.js";
import { applyOrderStatusChange } from "../services/order.service.js";
import { runFullSync } from "../services/poizon-sync.service.js";
import {
  loadShopPricingSettings,
  setMarkup,
} from "../services/pricing.service.js";
import { getEnvOptional } from "../types/env.types.js";

let adminBot: Bot | null = null;
let initialized = false;

async function isAdmin(telegramId: number): Promise<boolean> {
  const ids = await getAdminTelegramIds();
  if (ids.length === 0) return false;
  return ids.includes(telegramId);
}

function mainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📦 Новые заказы", "menu:pending")
    .row()
    .text("📋 Все заказы", "menu:all:0")
    .row()
    .text("📊 Статистика", "menu:stats")
    .text("💰 Цены", "menu:pricing")
    .row()
    .text("🔄 Синхронизация", "menu:sync")
    .text("⚙️ Помощь", "menu:help");
}

function orderKeyboard(orderId: string, status: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (status === "pending") {
    kb.text("✅ Подтвердить", `ord:cf:${orderId}`).text(
      "❌ Отмена",
      `ord:cx:${orderId}`,
    );
    kb.row();
  }
  if (["pending", "confirmed"].includes(status)) {
    kb.text("💰 RUB", `ord:pr:${orderId}`)
      .text("💵 USDT", `ord:pu:${orderId}`)
      .row();
    kb.text("💎 TON", `ord:pt:${orderId}`).row();
  }
  if (["paid", "processing"].includes(status)) {
    kb.text("📦 Отправлен", `ord:sh:${orderId}`).row();
  }
  if (status === "shipped") {
    kb.text("🎉 Доставлен", `ord:dl:${orderId}`).row();
  }
  kb.text("« Назад", "menu:main");
  return kb;
}

function formatOrder(o: Record<string, unknown>): string {
  const items = (o.items as unknown[]) ?? [];
  const delivery = o.delivery_info as {
    full_name?: string;
    phone?: string;
    address?: string;
  } | null;
  return [
    `Заказ #${o.short_id ?? o.id}`,
    `Статус: ${o.status}`,
    `Сумма: ${o.total_rub} ₽ / ${o.total_usdt} USDT`,
    `Оплата: ${o.payment_method ?? "—"}`,
    `Товаров: ${items.length}`,
    delivery
      ? `Клиент: ${delivery.full_name}\n${delivery.phone}\n${delivery.address}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getAdminBot(): Bot | null {
  const token = getEnvOptional("ADMIN_BOT_TOKEN");
  if (!token) return null;
  if (!adminBot) {
    adminBot = new Bot(token);
    setupAdminBot(adminBot);
  }
  return adminBot;
}

function setupAdminBot(bot: Bot): void {
  if (initialized) return;
  initialized = true;

  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!uid || !(await isAdmin(uid))) {
      if (ctx.message || ctx.callbackQuery) {
        await ctx.reply("Доступ запрещён.");
      }
      return;
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply("Панель администратора Poizon Shop", {
      reply_markup: mainMenu(),
    });
  });

  bot.command("stats", async (ctx) => {
    const s = await orderRepo.getOrderStats();
    await ctx.reply(
      `📊 Сегодня: ${s.today}\nНеделя: ${s.week}\nВыручка: ${s.revenue_today} ₽`,
    );
  });

  bot.command("pricing", async (ctx) => {
    const rates = await refreshRates();
    const cfg = await loadShopPricingSettings();
    await ctx.reply(
      [
        `Наценка: ${cfg.markup_percent}%`,
        `Доставка: ${cfg.delivery_fee} ₽`,
        `CNY/RUB: ${rates.cny_rub.toFixed(4)}`,
        `USDT/RUB: ${rates.usdt_rub.toFixed(2)}`,
        `CNY/USDT: ${rates.cny_per_usdt.toFixed(4)}`,
        `Курсы: ${rates.fetched_at}`,
      ].join("\n"),
    );
  });

  bot.command("sync", async (ctx) => {
    await ctx.reply("🔄 Синхронизация...");
    const result = await runFullSync();
    await ctx.reply(
      result.ok ? `✅ ${result.items_synced} товаров` : `❌ ${result.error}`,
    );
  });

  bot.callbackQuery("menu:main", async (ctx) => {
    await ctx.editMessageText("Главное меню", { reply_markup: mainMenu() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu:help", async (ctx) => {
    await ctx.editMessageText("/stats /pricing /sync", {
      reply_markup: mainMenu(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu:stats", async (ctx) => {
    const s = await orderRepo.getOrderStats();
    await ctx.editMessageText(`📊 Сегодня: ${s.today}\nНеделя: ${s.week}`, {
      reply_markup: mainMenu(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu:pricing", async (ctx) => {
    const rates = await refreshRates();
    const cfg = await loadShopPricingSettings();
    const kb = new InlineKeyboard()
      .text("+5%", "price:+5")
      .text("-5%", "price:-5")
      .row()
      .text("🔄 Курсы", "price:refresh")
      .row()
      .text("« Меню", "menu:main");
    await ctx.editMessageText(
      [
        `Наценка: ${cfg.markup_percent}%`,
        `Доставка: ${cfg.delivery_fee} ₽`,
        `CNY/RUB: ${rates.cny_rub.toFixed(4)}`,
        `USDT/RUB: ${rates.usdt_rub.toFixed(2)}`,
        `CNY/USDT: ${rates.cny_per_usdt.toFixed(4)}`,
        `Обновлено: ${rates.fetched_at}`,
      ].join("\n"),
      { reply_markup: kb },
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("price:refresh", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Обновление..." });
    const rates = await refreshRates(true);
    const cfg = await loadShopPricingSettings();
    const kb = new InlineKeyboard()
      .text("+5%", "price:+5")
      .text("-5%", "price:-5")
      .row()
      .text("🔄 Курсы", "price:refresh")
      .row()
      .text("« Меню", "menu:main");
    await ctx.editMessageText(
      [
        `Наценка: ${cfg.markup_percent}%`,
        `CNY/RUB: ${rates.cny_rub.toFixed(4)}`,
        `USDT/RUB: ${rates.usdt_rub.toFixed(2)}`,
        "✅ Курсы обновлены",
      ].join("\n"),
      { reply_markup: kb },
    );
  });

  bot.callbackQuery(/^price:(\+5|-5)$/, async (ctx) => {
    const cfg = await loadShopPricingSettings();
    const delta = ctx.match[1] === "+5" ? 5 : -5;
    const current = Number(cfg.markup_percent);
    if (!Number.isFinite(current)) {
      await ctx.answerCallbackQuery({ text: "Ошибка: нет текущей наценки" });
      return;
    }
    const next = Math.max(0, Math.min(200, current + delta));
    try {
      await setMarkup(next);
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: `Ошибка: ${e instanceof Error ? e.message : "save failed"}`,
      });
      return;
    }
    await ctx.answerCallbackQuery({ text: `${next}%` });
    await ctx.editMessageText(`Наценка: ${next}%`, {
      reply_markup: mainMenu(),
    });
  });

  bot.callbackQuery("menu:sync", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Sync..." });
    const result = await runFullSync();
    const text = result.ok
      ? `✅ Синхронизировано: ${result.items_synced}`
      : `❌ ${result.error ?? "Ошибка синхронизации"}`;
    await ctx.editMessageText(text, { reply_markup: mainMenu() });
  });

  bot.callbackQuery("menu:pending", async (ctx) => {
    const { orders } = await orderRepo.listOrdersAdmin({
      status: "pending",
      page: 1,
      limit: 10,
    });
    const kb = new InlineKeyboard();
    for (const o of orders.slice(0, 8)) {
      kb.text(`#${o.short_id}`, `ord:view:${o.id}`).row();
    }
    kb.text("« Меню", "menu:main");
    await ctx.editMessageText(
      orders.length ? "📦 Новые:" : "Нет новых заказов",
      { reply_markup: kb },
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^menu:all:(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]) + 1;
    const { orders, total } = await orderRepo.listOrdersAdmin({
      page,
      limit: 8,
    });
    const kb = new InlineKeyboard();
    for (const o of orders) {
      kb.text(`#${o.short_id}`, `ord:view:${o.id}`).row();
    }
    if (page * 8 < total) kb.text("→", `menu:all:${page}`);
    kb.text("«", "menu:main");
    await ctx.editMessageText(`📋 стр.${page}`, { reply_markup: kb });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^ord:view:(.+)$/, async (ctx) => {
    const id = ctx.match[1] ?? "";
    const detail = await orderRepo.getOrderById(id);
    if (!detail) {
      await ctx.answerCallbackQuery({ text: "Не найден" });
      return;
    }
    const row = await orderRepo.getOrderWithUser(id);
    await ctx.editMessageText(formatOrder(row?.order ?? {}), {
      reply_markup: orderKeyboard(id, detail.status),
    });
    await ctx.answerCallbackQuery();
  });

  async function applyStatus(
    orderId: string,
    status: OrderStatus,
    adminId: number,
    paymentMethod?: PaymentMethod,
  ): Promise<{ notifySent: boolean }> {
    const result = await applyOrderStatusChange({
      orderId,
      status,
      adminTelegramId: adminId,
      paymentMethod,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return { notifySent: result.notifySent };
  }

  bot.callbackQuery(/^ord:cf:(.+)$/, async (ctx) => {
    try {
      const { notifySent } = await applyStatus(
        ctx.match[1] ?? "",
        "confirmed",
        ctx.from.id,
      );
      await ctx.answerCallbackQuery({
        text: notifySent ? "OK" : "OK, но уведомление клиенту не доставлено",
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });
  bot.callbackQuery(/^ord:cx:(.+)$/, async (ctx) => {
    try {
      const { notifySent } = await applyStatus(
        ctx.match[1] ?? "",
        "cancelled",
        ctx.from.id,
      );
      await ctx.answerCallbackQuery({
        text: notifySent ? "OK" : "OK, но уведомление клиенту не доставлено",
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });
  bot.callbackQuery(/^ord:pr:(.+)$/, async (ctx) => {
    try {
      const { notifySent } = await applyStatus(
        ctx.match[1] ?? "",
        "paid",
        ctx.from.id,
        "rub_manual",
      );
      await ctx.answerCallbackQuery({
        text: notifySent ? "RUB" : "RUB, уведомление не доставлено",
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });
  bot.callbackQuery(/^ord:pu:(.+)$/, async (ctx) => {
    try {
      const { notifySent } = await applyStatus(
        ctx.match[1] ?? "",
        "paid",
        ctx.from.id,
        "usdt_manual",
      );
      await ctx.answerCallbackQuery({
        text: notifySent ? "USDT" : "USDT, уведомление не доставлено",
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });
  bot.callbackQuery(/^ord:pt:(.+)$/, async (ctx) => {
    try {
      const { notifySent } = await applyStatus(
        ctx.match[1] ?? "",
        "paid",
        ctx.from.id,
        "ton",
      );
      await ctx.answerCallbackQuery({
        text: notifySent ? "TON" : "TON, уведомление не доставлено",
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });
  bot.callbackQuery(/^ord:sh:(.+)$/, async (ctx) => {
    try {
      const { notifySent } = await applyStatus(
        ctx.match[1] ?? "",
        "shipped",
        ctx.from.id,
      );
      await ctx.answerCallbackQuery({
        text: notifySent ? "OK" : "OK, но уведомление клиенту не доставлено",
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });
  bot.callbackQuery(/^ord:dl:(.+)$/, async (ctx) => {
    try {
      const { notifySent } = await applyStatus(
        ctx.match[1] ?? "",
        "delivered",
        ctx.from.id,
      );
      await ctx.answerCallbackQuery({
        text: notifySent ? "OK" : "OK, но уведомление клиенту не доставлено",
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });

  // Обработчики из уведомления о новом заказе (callback_data содержит short_id)
  bot.callbackQuery(/^ord:cf:byshort:(.+)$/, async (ctx) => {
    const shortId = ctx.match[1] ?? "";
    const row = await orderRepo.getOrderByShortId(shortId);
    if (!row) {
      await ctx.answerCallbackQuery({ text: "Не найден", show_alert: true });
      return;
    }
    try {
      const { notifySent } = await applyStatus(
        row.id,
        "confirmed",
        ctx.from.id,
      );
      await ctx.answerCallbackQuery({
        text: notifySent
          ? `✅ #${shortId} подтверждён`
          : `✅ #${shortId} подтверждён, уведомление не доставлено`,
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });
  bot.callbackQuery(/^ord:cx:byshort:(.+)$/, async (ctx) => {
    const shortId = ctx.match[1] ?? "";
    const row = await orderRepo.getOrderByShortId(shortId);
    if (!row) {
      await ctx.answerCallbackQuery({ text: "Не найден", show_alert: true });
      return;
    }
    try {
      const { notifySent } = await applyStatus(
        row.id,
        "cancelled",
        ctx.from.id,
      );
      await ctx.answerCallbackQuery({
        text: notifySent
          ? `❌ #${shortId} отменён`
          : `❌ #${shortId} отменён, уведомление не доставлено`,
        show_alert: !notifySent,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: e instanceof Error ? e.message : "Ошибка",
        show_alert: true,
      });
    }
  });
}

export async function handleAdminUpdate(update: unknown): Promise<void> {
  const bot = getAdminBot();
  if (!bot) {
    console.warn("[admin-bot] no ADMIN_BOT_TOKEN");
    return;
  }
  try {
    await bot.handleUpdate(update as Parameters<Bot["handleUpdate"]>[0]);
  } catch (err) {
    console.error("[admin-bot] handleUpdate error:", err);
  }
}
