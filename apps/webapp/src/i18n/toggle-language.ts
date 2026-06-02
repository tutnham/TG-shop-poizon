import { apiPatch } from "../api/client.js";
import { type Lang, getLang, setLang } from "./index.js";

/** Метка кнопки: язык, на который переключимся. */
export function langToggleLabel(): string {
  return getLang() === "ru" ? "EN" : "RU";
}

export async function toggleLanguage(): Promise<void> {
  const next: Lang = getLang() === "ru" ? "en" : "ru";
  setLang(next);
  try {
    await apiPatch("/api/user/language", { language_code: next });
  } catch {
    /* offline ok */
  }
  window.location.reload();
}
