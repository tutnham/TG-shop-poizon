/**
 * Циклический бэкфилл size_prices: ждёт стабильный API и прогоняет батчи до remaining=0.
 *
 * Использование:
 *   npx tsx scripts/backfill-size-prices-loop.ts [--limit=100] [--delay=2000] [--wait=300000]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const delayArg = args.find((a) => a.startsWith("--delay="));
const waitArg = args.find((a) => a.startsWith("--wait="));

const LIMIT = limitArg ?? "--limit=100";
const DELAY = delayArg ?? "--delay=2000";
const WAIT_MS = Number(waitArg?.split("=")[1] ?? "300000");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backfillScript = join(scriptDir, "backfill-size-prices.ts");

function runBackfillBatch(): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", backfillScript, LIMIT, DELAY],
      {
        cwd: join(scriptDir, ".."),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRemaining(output: string): number | null {
  const match = output.match(/remaining=(\d+)/);
  return match ? Number(match[1]) : null;
}

async function main(): Promise<void> {
  console.log(
    `[backfill-loop] Старт: ${LIMIT} ${DELAY}, пауза между попытками=${WAIT_MS}ms`,
  );

  let round = 0;
  while (true) {
    round++;
    console.log(`\n[backfill-loop] === Раунд ${round} ===`);
    const { code, output } = await runBackfillBatch();
    const remaining = parseRemaining(output);

    if (remaining === 0) {
      console.log("[backfill-loop] Завершено: remaining=0");
      return;
    }

    if (code === 0 && remaining != null && remaining > 0) {
      console.log(
        `[backfill-loop] Батч завершён, remaining=${remaining}, следующий батч...`,
      );
      continue;
    }

    console.warn(
      `[backfill-loop] Батч не выполнен (code=${code}, remaining=${remaining ?? "?"}), ждём ${WAIT_MS}ms`,
    );
    await sleep(WAIT_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
