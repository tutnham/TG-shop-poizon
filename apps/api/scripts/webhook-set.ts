import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { getEnvOptional } from "../src/types/env.types.js";

loadDotEnv();

const apiUrl = getEnvOptional("API_URL") || getEnvOptional("WEBAPP_URL");
const secret = getEnvOptional("WEBHOOK_SECRET");
const shopToken = getEnvOptional("SHOP_BOT_TOKEN");
const adminToken = getEnvOptional("ADMIN_BOT_TOKEN");
const vercelBypass = getEnvOptional("VERCEL_AUTOMATION_BYPASS_SECRET");

function buildWebhookUrl(path: string): string {
  const base = `${apiUrl.replace(/\/$/, "")}/webhook/${path}`;
  if (!vercelBypass) return base;
  const q = new URLSearchParams({ "x-vercel-protection-bypass": vercelBypass });
  return `${base}?${q.toString()}`;
}

async function setWebhook(token: string, path: string) {
  const url = buildWebhookUrl(path);
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret || undefined,
      allowed_updates: ["message", "callback_query", "pre_checkout_query"],
    }),
  });
  const data = await res.json();
  console.log(path, url, data);
}

if (!apiUrl) {
  console.error("Set API_URL or WEBAPP_URL (your Vercel production URL)");
  process.exit(1);
}
if (!shopToken || !adminToken) {
  console.error(
    "Set SHOP_BOT_TOKEN and ADMIN_BOT_TOKEN in .env (copy from Vercel → project root .env)",
  );
  process.exit(1);
}

await setWebhook(shopToken, "shop");
await setWebhook(adminToken, "admin");
