import { cors } from "hono/cors";
import { getEnvOptional } from "../types/env.types.js";

export function createCors() {
  const origins = getEnvOptional("CORS_ORIGINS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const webapp = getEnvOptional("WEBAPP_URL");
  const allowed = new Set([...origins, webapp].filter(Boolean));

  return cors({
    origin: (origin) => {
      if (!origin) return allowed.size > 0 ? webapp || origins[0] || "" : null;
      if (allowed.has(origin)) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "X-Telegram-Init-Data"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
}
