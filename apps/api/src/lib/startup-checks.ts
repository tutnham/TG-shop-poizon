import { getEnvOptional, isProduction } from "../types/env.types.js";

export function runStartupChecks(): void {
  if (isProduction()) {
    const secret = getEnvOptional("WEBHOOK_SECRET");
    if (!secret || secret.length < 32) {
      throw new Error("WEBHOOK_SECRET (≥32 chars) is required in production");
    }
    const cronSecret = getEnvOptional("CRON_SECRET");
    if (!cronSecret || cronSecret.length < 32) {
      throw new Error("CRON_SECRET (≥32 chars) is required in production");
    }
  }

  // Предупреждения для среды Vercel / production (не блокируют запуск)
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.warn("⚠️  CRON_SECRET is empty — cron endpoints are unprotected");
    }
    if (!process.env.WEBHOOK_SECRET) {
      console.warn(
        "⚠️  WEBHOOK_SECRET is empty — webhook endpoints are unprotected",
      );
    }
  }
}
