import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { getEnvOptional } from "../types/env.types.js";

let client: SupabaseClient | null = null;

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars, BOM
    .trim()
    .replace(/^["']|["']$/g, "")  // wrapping quotes
    .replace(/\/rest\/v1\/?$/, "") // strip /rest/v1 suffix (supabase-js adds it back)
    .replace(/\/+$/, "");           // trailing slashes
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = cleanEnv(getEnvOptional("SUPABASE_URL"));
  const key = cleanEnv(getEnvOptional("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
