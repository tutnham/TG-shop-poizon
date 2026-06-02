import en from "./en.json";
import ru from "./ru.json";

export type Lang = "ru" | "en";

const dicts: Record<Lang, Record<string, string>> = { ru, en };

const LANG_STORAGE_KEY = "poizon_lang";

let currentLang: Lang = "ru";

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* private mode */
  }
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string): string {
  return dicts[currentLang][key] ?? dicts.ru[key] ?? key;
}

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "ru" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  const tg = window.Telegram?.WebApp;
  const code = tg?.initDataUnsafe?.user?.language_code;
  if (code?.startsWith("en")) return "en";
  return "ru";
}
