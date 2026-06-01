import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { getEnvOptional } from "../types/env.types.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = getEnvOptional("SUPABASE_URL");
  const key = getEnvOptional("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
