/** True when running on Vercel serverless (30s limit applies). */
export function isVercelServerless(): boolean {
  return process.env.VERCEL === "1";
}

export const VERCEL_SYNC_BLOCKED_MESSAGE =
  "Полная синхронизация недоступна на Vercel (лимит 30s). Запустите: bun run --cwd apps/api sync:poizon";
