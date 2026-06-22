import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { setTelegramWebhooks } from "../src/services/webhook-setup.service.js";

loadDotEnv();

try {
  const results = await setTelegramWebhooks();
  for (const { path, url } of results) {
    console.log(path, url, { ok: true });
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
