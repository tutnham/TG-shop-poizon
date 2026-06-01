import { getEnvOptional } from "../src/types/env.types.js";

const apiUrl = getEnvOptional("API_URL") || getEnvOptional("WEBAPP_URL");
const secret = getEnvOptional("WEBHOOK_SECRET");
const shopToken = getEnvOptional("SHOP_BOT_TOKEN");
const adminToken = getEnvOptional("ADMIN_BOT_TOKEN");

async function setWebhook(token: string, path: string) {
  const url = `${apiUrl.replace(/\/$/, "")}/webhook/${path}`;
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
  console.log(path, data);
}

if (!shopToken || !adminToken) {
  console.error("Set SHOP_BOT_TOKEN and ADMIN_BOT_TOKEN");
  process.exit(1);
}

await setWebhook(shopToken, "shop");
await setWebhook(adminToken, "admin");
