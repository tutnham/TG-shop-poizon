import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getEnvOptional } from "../src/types/env.types.js";

function loadDotEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const path = resolve(dir, ".env");
    if (existsSync(path)) {
      for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
      return;
    }
    dir = dirname(dir);
  }
}

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
