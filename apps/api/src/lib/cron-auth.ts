import { timingSafeEqual } from "node:crypto";
import { getEnvOptional, isProduction } from "../types/env.types.js";

export function verifyCronAuth(authHeader: string | undefined): boolean {
  const secret = getEnvOptional("CRON_SECRET");
  if (!secret) return !isProduction();
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}
