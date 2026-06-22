import { loadDotEnv } from "../src/lib/load-dotenv.js";

loadDotEnv();

function resolveApiUrl(): string {
  const raw =
    process.env.API_URL ||
    process.env.WEBAPP_URL ||
    process.env.VITE_API_URL ||
    "";
  return raw.replace(/\/$/, "");
}

const apiUrl = resolveApiUrl();
const cronSecret = process.env.CRON_SECRET || "";

if (!apiUrl) {
  console.error(
    "Set API_URL, WEBAPP_URL or VITE_API_URL in .env (repo root) or environment",
  );
  process.exit(1);
}
if (!cronSecret) {
  console.error("Set CRON_SECRET in .env (repo root) or environment");
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
