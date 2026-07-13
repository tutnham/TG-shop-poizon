import { getSupabase } from "../src/db/client.js";
import { loadDotEnv } from "../src/lib/load-dotenv.js";

loadDotEnv();

async function main(): Promise<void> {
  const sb = getSupabase();
  const { data: cats } = await sb
    .from("categories")
    .select("id,slug")
    .in("slug", ["watches", "glasses"]);

  for (const slug of ["watches", "glasses"] as const) {
    const categoryId = cats?.find((c) => c.slug === slug)?.id;
    if (!categoryId) {
      console.log(`${slug}: category missing`);
      continue;
    }
    const { count } = await sb
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId);
    console.log(`${slug}: ${count ?? 0}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
