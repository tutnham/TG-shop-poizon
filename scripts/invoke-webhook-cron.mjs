/**
 * Вызов GET /cron/webhooks на деплое (для ручной перерегистрации Telegram webhooks).
 *
 * Использование:
 *   CRON_SECRET=... API_URL=https://your-app.vercel.app node scripts/invoke-webhook-cron.mjs
 */
const apiUrl = (process.env.API_URL || process.env.WEBAPP_URL || "").replace(
  /\/$/,
  "",
);
const cronSecret = process.env.CRON_SECRET || "";

if (!apiUrl) {
  console.error("Set API_URL or WEBAPP_URL");
  process.exit(1);
}
if (!cronSecret) {
  console.error("Set CRON_SECRET");
  process.exit(1);
}

const target = `${apiUrl}/cron/webhooks`;
console.log(`GET cron → ${target}`);

const res = await fetch(target, {
  headers: { Authorization: `Bearer ${cronSecret}` },
});

const body = await res.text();
console.log(`HTTP ${res.status}`);
console.log(body);
process.exit(res.ok ? 0 : 1);
