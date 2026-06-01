export interface AppEnv {
  Variables: {
    telegramUser: TelegramUserContext;
    userId: string;
  };
}

export interface TelegramUserContext {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

export function getEnvOptional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
