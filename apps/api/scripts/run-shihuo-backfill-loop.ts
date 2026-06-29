/**
 * Повторяет backfill-shihuo-prices батчами, пока size_prices не заполнены.
 *
 * Использование:
 *   npx tsx scripts/run-shihuo-backfill-loop.ts [pop2.json] [--batch=80] [--delay=6000]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { getSupabase } from "../src/db/client.js";

loadDotEnv();

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith("--"));
const batchArg = args.find((a) => a.startsWith("--batch="));
const delayArg = args.find((a) => a.startsWith("--delay="));

const BATCH = Number(batchArg?.split("=")[1] ?? "80");
const DELAY = delayArg?.split("=")[1] ?? "6000";
const MAX_ROUNDS = 50;
const PAUSE_BETWEEN_ROUNDS_MS = 15_000;

async function countEmptySizePrices(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("source", "poizon")
    .filter("size_prices", "eq", "{}");

  if (error) throw new Error(error.message);
  return count ?? 0;
}

function runBatch(offset: number): Promise<number> {
  const script = fileURLToPath(
    new URL("./backfill-shihuo-prices.ts", import.meta.url),
  );
  const filePath =
    fileArg ??
    fileURLToPath(new URL("../../../pop2.json", import.meta.url));

  return new Promise((resolve, reject) => {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(
      npx,
      [
        "tsx",
        script,
        filePath,
        `--offset=${offset}`,
        `--limit=${BATCH}`,
        `--delay=${DELAY}`,
      ],
      {
        stdio: "inherit",
        env: process.env,
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        shell: process.platform === "win32",
      },
    );

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  let round = 0;
  let offset = 0;
  let prevEmpty = await countEmptySizePrices();

  console.log(`[loop] start empty=${prevEmpty} batch=${BATCH} delay=${DELAY}`);

  while (round < MAX_ROUNDS && prevEmpty > 0) {
    round++;
    console.log(`\n[loop] round=${round} offset=${offset} empty=${prevEmpty}`);

    const code = await runBatch(offset);
    if (code !== 0) {
      console.warn(`[loop] batch exit code=${code}, continuing next round`);
    }

    const empty = await countEmptySizePrices();
    const progress = prevEmpty - empty;
    console.log(`[loop] round=${round} done empty=${empty} progress=${progress}`);

    if (empty === 0) {
      console.log("[loop] all size_prices filled");
      return;
    }

    if (progress <= 0) {
      offset = 0;
      console.log("[loop] no progress, reset offset and pause 3min");
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_ROUNDS_MS * 12));
    } else {
      offset = 0;
    }

    prevEmpty = empty;
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_ROUNDS_MS));
  }

  const remaining = await countEmptySizePrices();
  console.log(`[loop] finished rounds=${round} remaining empty=${remaining}`);
  if (remaining > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
