import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { refreshRates } from "../src/services/currency.service.js";

loadDotEnv();

const rates = await refreshRates(true);
console.log(
  JSON.stringify(
    {
      ok: true,
      cny_rub: rates.cny_rub,
      usdt_rub: rates.usdt_rub,
      cny_per_usdt: rates.cny_per_usdt,
      updated_at: rates.fetched_at,
      sources: rates.sources,
    },
    null,
    2,
  ),
);
