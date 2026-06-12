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
  console.error("[db] Supabase URL len:", url.length, "first/last:", JSON.stringify(url.slice(0, 8)), "/", JSON.stringify(url.slice(-8)));
  client = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: ((...args: Parameters<typeof fetch>) => {
        const [input] = args;
        const urlStr = typeof input === "string" ? input : (input as Request).url;
        console.error("[db:fetch]", urlStr.slice(0, 200));
        return fetch(...args);
      }) as typeof fetch,
    },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
