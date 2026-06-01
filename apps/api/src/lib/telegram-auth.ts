import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramUserContext } from "../types/env.types.js";

const MAX_AUTH_AGE_SEC = 86400;

export function validateInitData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) return false;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;

  const authDate = params.get("auth_date");
  if (!authDate) return false;
  const age = Math.floor(Date.now() / 1000) - Number.parseInt(authDate, 10);
  if (Number.isNaN(age) || age < 0 || age > MAX_AUTH_AGE_SEC) return false;

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  try {
    const a = Buffer.from(expectedHash, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseTelegramUser(
  initData: string,
): TelegramUserContext | null {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    const u = JSON.parse(userRaw) as {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    return {
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      username: u.username,
      language_code: u.language_code,
    };
  } catch {
    return null;
  }
}

/** Build initData for tests */
export function buildTestInitData(
  user: TelegramUserContext,
  botToken: string,
): string {
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    user: JSON.stringify(user),
    auth_date: String(authDate),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}
