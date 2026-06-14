import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison for shared secrets (webhook, cron, etc.). */
export function verifySecretToken(
  provided: string | undefined,
  expected: string,
): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
