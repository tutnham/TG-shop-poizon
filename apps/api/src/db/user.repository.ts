import type { TelegramUserContext } from "../types/env.types.js";
import { getSupabase } from "./client.js";

export async function upsertTelegramUser(
  tg: TelegramUserContext,
): Promise<string> {
  const { data, error } = await getSupabase()
    .from("users")
    .upsert(
      {
        telegram_id: tg.id,
        username: tg.username ?? null,
        first_name: tg.first_name ?? null,
        last_name: tg.last_name ?? null,
        language_code: tg.language_code ?? "ru",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
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
