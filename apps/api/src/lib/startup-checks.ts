import {
  getEnvOptional,
  isDemoMode,
  isProduction,
} from "../types/env.types.js";

export function runStartupChecks(): void {
  if (isProduction() && isDemoMode()) {
    throw new Error("DEMO_MODE must not be enabled in production");
  }

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
}
