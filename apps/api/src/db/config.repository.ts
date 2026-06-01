import { getSupabase } from "./client.js";

export async function getConfigValue<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await getSupabase()
    .from("shop_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return data.value as T;
}

export async function setConfigValue(
  key: string,
  value: unknown,
): Promise<void> {
  const { error } = await getSupabase()
    .from("shop_config")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function getAdminTelegramIds(): Promise<number[]> {
  const ids = await getConfigValue<number[]>("admin_telegram_ids", []);
  return Array.isArray(ids) ? ids.filter((id) => Number.isFinite(id)) : [];
}

export async function getConfigValues(
  keys: string[],
): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase()
    .from("shop_config")
    .select("key, value")
    .in("key", keys);
  if (error) throw new Error(error.message);
  const out: Record<string, unknown> = {};
  for (const row of data ?? []) {
    out[row.key as string] = row.value;
  }
  return out;
}
