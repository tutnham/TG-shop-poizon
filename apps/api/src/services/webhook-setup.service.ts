import { getEnvOptional } from "../types/env.types.js";

function buildWebhookUrl(path: string): string {
  const apiUrl = getEnvOptional("API_URL") || getEnvOptional("WEBAPP_URL");
  if (!apiUrl) throw new Error("Set API_URL or WEBAPP_URL");
  const vercelBypass = getEnvOptional("VERCEL_AUTOMATION_BYPASS_SECRET");
  const base = `${apiUrl.replace(/\/$/, "")}/webhook/${path}`;
  if (!vercelBypass) return base;
  const q = new URLSearchParams({ "x-vercel-protection-bypass": vercelBypass });
  return `${base}?${q.toString()}`;
}

async function setWebhook(token: string, path: string) {
  const url = buildWebhookUrl(path);
  const secret = getEnvOptional("WEBHOOK_SECRET");
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret || undefined,
      allowed_updates: ["message", "callback_query", "pre_checkout_query"],
    }),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (!data.ok) {
    throw new Error(`${path}: ${data.description ?? "setWebhook failed"}`);
  }
  return { path, url };
}

export async function setTelegramWebhooks(): Promise<
  Array<{ path: string; url: string }>
> {
  const shopToken = getEnvOptional("SHOP_BOT_TOKEN");
  const adminToken = getEnvOptional("ADMIN_BOT_TOKEN");
  if (!shopToken || !adminToken) {
    throw new Error("Set SHOP_BOT_TOKEN and ADMIN_BOT_TOKEN");
  }
  const shop = await setWebhook(shopToken, "shop");
  const admin = await setWebhook(adminToken, "admin");
  return [shop, admin];
}
