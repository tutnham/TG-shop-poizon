/**
 * Удаление демо-товаров (с Unsplash-картинками) из БД.
 *
 * Использование:
 *   npx tsx scripts/delete-demo.ts
 */
import { loadDotEnv } from "../src/lib/load-dotenv.js";

loadDotEnv();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function safeFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("Connection", "close");
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function headers(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function main() {
  // Шаг 1: получаем все товары через cursor-пагинацию (быстрее offset)
  const limit = 50;
  let lastId = "00000000-0000-0000-0000-000000000000";
  const allIds: string[] = [];
  const demoIds: string[] = [];

  console.log("[delete-demo] Загружаем список товаров...");

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/products?select=id,image_urls&id=gt.${lastId}&limit=${limit}&order=id.asc`;
    const res = await safeFetch(url, { headers: headers() });
    if (!res.ok) {
      console.error(`Ошибка загрузки: ${res.status}`);
      process.exit(1);
    }
    const rows = (await res.json()) as { id: string; image_urls: string[] }[];

    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = row.id;
      allIds.push(row.id);
      if (
        row.image_urls?.length > 0 &&
        row.image_urls[0].includes("unsplash")
      ) {
        demoIds.push(row.id);
      }
    }

    console.log(`[delete-demo] Загружено: ${allIds.length} товаров...`);

    if (rows.length < limit) break;
  }

  console.log(`[delete-demo] Всего товаров: ${allIds.length}`);
  console.log(`[delete-demo] Демо-товаров (unsplash): ${demoIds.length}`);

  if (demoIds.length === 0) {
    console.log("[delete-demo] Нечего удалять.");
    process.exit(0);
  }

  // Шаг 2: удаляем демо-товары
  console.log(`[delete-demo] Удаляем ${demoIds.length} товаров...`);

  let deleted = 0;
  let errors = 0;

  for (let i = 0; i < demoIds.length; i++) {
    const id = demoIds[i];
    let success = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const delUrl = `${SUPABASE_URL}/rest/v1/products?id=eq.${id}`;
        const res = await safeFetch(delUrl, {
          method: "DELETE",
          headers: headers(),
        });
        if (res.ok) {
          success = true;
          break;
        }
        const text = await res.text().catch(() => "");
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        } else {
          console.error(
            `[delete-demo] Ошибка удаления ${id.slice(0, 8)}: ${res.status} ${text.slice(0, 100)}`,
          );
        }
      } catch (e) {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        } else {
          console.error(
            `[delete-demo] Ошибка удаления ${id.slice(0, 8)}: ${(e as Error).message}`,
          );
        }
      }
    }

    if (success) {
      deleted++;
    } else {
      errors++;
    }

    if ((i + 1) % 20 === 0 || i === demoIds.length - 1) {
      console.log(
        `[delete-demo] Прогресс: ${i + 1}/${demoIds.length} | удалено=${deleted} ошибок=${errors}`,
      );
    }

    // Задержка между запросами
    if (i < demoIds.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log("\n[delete-demo] Готово!");
  console.log(`  Удалено: ${deleted}`);
  console.log(`  Ошибок: ${errors}`);
}

main().catch((e) => {
  console.error("Критическая ошибка:", e);
  process.exit(1);
});
