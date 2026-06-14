import { getEnvOptional, isProduction } from "../types/env.types.js";
import { verifySecretToken } from "./verify-secret.js";

export function verifyCronAuth(authHeader: string | undefined): boolean {
  const secret = getEnvOptional("CRON_SECRET");
  if (!secret) return !isProduction();
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  return verifySecretToken(token, secret);
}
