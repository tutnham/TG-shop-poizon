const fs = require("node:fs");
const SUPABASE_KEY =
  fs
    .readFileSync("c:/Users/14072023pc/Desktop/TG-shop/.env", "utf-8")
    .match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1] || "";
fetch(
  "https://glbgbkuwdhhrsbhsgxek.supabase.co/rest/v1/products?select=id&limit=10000&order=id.asc",
  {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  },
)
  .then(async (r) => {
    const data = await r.json();
    console.log("DB products count:", data.length);
  })
  .catch((e) => console.error("Error:", e.message));
