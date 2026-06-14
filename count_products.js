console.log("start");
const SUPABASE_URL = "https://glbgbkuwdhhrsbhsgxek.supabase.co";
const fs = require("node:fs");
const SUPABASE_KEY =
  fs
    .readFileSync("c:/Users/14072023pc/Desktop/TG-shop/.env", "utf-8")
    .match(/SUPABASE_SERVICE_ROLE_KEY[= ]+"?([^"\r\n]+)"?/)?.[1] || "";
console.log("key len:", SUPABASE_KEY.length);

async function main() {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Prefer: "count=exact",
  };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=id&limit=1`,
    { headers },
  );
  console.log("status:", res.status);
  const range = res.headers.get("content-range");
  console.log("Content-Range:", range);
  const match = range?.match(/\/(\d+)/);
  console.log("Всего товаров в БД:", match ? match[1] : "неизвестно");
}
main().catch((e) => console.error("Error:", e.message));
