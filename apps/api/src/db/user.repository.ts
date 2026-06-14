import type { TelegramUserContext } from "../types/env.types.js";
import { getSupabase } from "./client.js";

export async function upsertTelegramUser(
  tg: TelegramUserContext,
): Promise<string> {
  const db = getSupabase();
  const payload = {
    telegram_id: tg.id,
    username: tg.username ?? null,
    first_name: tg.first_name ?? null,
    last_name: tg.last_name ?? null,
    language_code: tg.language_code ?? "ru",
    last_seen_at: new Date().toISOString(),
  };

  // Проверяем, существует ли пользователь
  const { data: existing, error: findErr } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", tg.id)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);

  if (existing) {
    // Обновляем существующего
    const { error: updErr } = await db
      .from("users")
      .update(payload)
      .eq("id", existing.id);
    if (updErr) throw new Error(updErr.message);
    return existing.id;
  }

  // Создаём нового
  const { data: created, error: insErr } = await db
    .from("users")
    .insert(payload)
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  return created?.id;
}

export async function updateUserLanguage(
  userId: string,
  languageCode: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("users")
    .update({ language_code: languageCode })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function getUserById(userId: string): Promise<{
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
} | null> {
  const { data } = await getSupabase()
    .from("users")
    .select("id, telegram_id, username, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function getUserByTelegramId(telegramId: number): Promise<{
  id: string;
  telegram_id: number;
} | null> {
  const { data } = await getSupabase()
    .from("users")
    .select("id, telegram_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data;
}
