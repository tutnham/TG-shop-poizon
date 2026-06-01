import en from "./en.json";
import ru from "./ru.json";

export type Lang = "ru" | "en";

const dicts: Record<Lang, Record<string, string>> = { ru, en };

let currentLang: Lang = "ru";

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string): string {
  return dicts[currentLang][key] ?? dicts.ru[key] ?? key;
}

export function detectLang(): Lang {
  const tg = window.Telegram?.WebApp;
  const code = tg?.initDataUnsafe?.user?.language_code;
  if (code?.startsWith("en")) return "en";
  return "ru";
}
