import {
  hideKeyboard,
  isEditableElement,
  isKeyboardDismissPaused,
  isWithinEditableFocusGrace,
} from "./lib/keyboard.js";

/** Фон Mini App — совпадает с --color-bg в tokens.css */
export const TG_BG = "#111317";

type Inset = { top: number; bottom: number; left: number; right: number };

type ThemeParams = Record<string, string | undefined>;

type TgWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: {
      id?: number;
      language_code?: string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation: () => void;
  disableVerticalSwipes?: () => void;
  colorScheme?: "light" | "dark";
  themeParams?: ThemeParams;
  safeAreaInset?: Inset;
  contentSafeAreaInset?: Inset;
  viewportStableHeight?: number;
  isExpanded?: boolean;
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
  MainButton: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
    isVisible?: boolean;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (s: "light" | "medium" | "heavy") => void;
    notificationOccurred: (s: "error" | "success" | "warning") => void;
  };
  showAlert: (msg: string) => void;
  openLink: (url: string) => void;
  hideKeyboard?: () => void;
  viewportHeight?: number;
};

const ZERO_INSET: Inset = { top: 0, bottom: 0, left: 0, right: 0 };

let mainButtonHandler: (() => void) | null = null;
let backButtonHandler: (() => void) | null = null;

function insetPx(value: number | undefined): string {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value)
      : 0;
  return `${n}px`;
}

function normalizeInset(raw?: Partial<Inset> | null): Inset {
  if (!raw) return { ...ZERO_INSET };
  return {
    top: raw.top ?? 0,
    bottom: raw.bottom ?? 0,
    left: raw.left ?? 0,
    right: raw.right ?? 0,
  };
}

/** Пробрасывает safe / content safe area из Telegram в CSS-переменные. */
export function applyTelegramLayout(): void {
  const tg = getTg();
  const root = document.documentElement;

  const safe = normalizeInset(tg?.safeAreaInset);
  const content = normalizeInset(tg?.contentSafeAreaInset ?? tg?.safeAreaInset);

  root.style.setProperty("--tg-safe-top", insetPx(safe.top));
  root.style.setProperty("--tg-safe-bottom", insetPx(safe.bottom));
  root.style.setProperty("--tg-safe-left", insetPx(safe.left));
  root.style.setProperty("--tg-safe-right", insetPx(safe.right));

  root.style.setProperty("--tg-content-top", insetPx(content.top));
  root.style.setProperty("--tg-content-bottom", insetPx(content.bottom));
  root.style.setProperty("--tg-content-left", insetPx(content.left));
  root.style.setProperty("--tg-content-right", insetPx(content.right));
}

function applyTelegramChrome(): void {
  const tg = getTg();
  if (!tg) return;
  tg.setHeaderColor(TG_BG);
  tg.setBackgroundColor(TG_BG);
  document.documentElement.classList.add("tg-mini-app", "tg-theme-dark");
  document.documentElement.style.colorScheme = "dark";
}

function onThemeChanged(): void {
  applyTelegramChrome();
  applyTelegramLayout();
}

function bindTelegramEvents(): void {
  const tg = getTg();
  if (!tg?.onEvent) return;

  const relayout = () => {
    applyTelegramLayout();
  };

  const onViewportChanged = () => {
    relayout();
    if (isKeyboardDismissPaused()) return;
    if (isEditableElement(document.activeElement)) return;
    if (isWithinEditableFocusGrace()) return;
    const vv = window.visualViewport;
    if (vv && vv.height >= window.innerHeight * 0.92) {
      hideKeyboard();
    }
  };

  tg.onEvent("themeChanged", onThemeChanged);
  tg.onEvent("safeAreaChanged", relayout);
  tg.onEvent("contentSafeAreaChanged", relayout);
  tg.onEvent("viewportChanged", onViewportChanged);
}

export function getTg(): TgWebApp | undefined {
  return window.Telegram?.WebApp as TgWebApp | undefined;
}

export function initTelegram(): void {
  const tg = getTg();
  if (!tg) return;

  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
  tg.disableVerticalSwipes?.();

  applyTelegramChrome();
  applyTelegramLayout();
  bindTelegramEvents();

  requestAnimationFrame(() => applyTelegramLayout());
  setTimeout(() => applyTelegramLayout(), 120);
}

export function haptic(type: "light" | "medium" | "success" = "light"): void {
  const tg = getTg();
  if (!tg) return;
  if (type === "success") tg.HapticFeedback?.notificationOccurred("success");
  else tg.HapticFeedback?.impactOccurred(type);
}

export function showMainButton(text: string, onClick: () => void): void {
  const tg = getTg();
  if (!tg?.MainButton) return;

  if (mainButtonHandler) {
    tg.MainButton.offClick(mainButtonHandler);
  }
  mainButtonHandler = onClick;

  tg.MainButton.setText(text);
  tg.MainButton.show();
  tg.MainButton.onClick(onClick);
  document.documentElement.classList.add("tg-main-button-visible");

  requestAnimationFrame(() => applyTelegramLayout());
  setTimeout(() => applyTelegramLayout(), 150);
}

export function hideMainButton(): void {
  const tg = getTg();
  if (!tg?.MainButton) return;

  if (mainButtonHandler) {
    tg.MainButton.offClick(mainButtonHandler);
    mainButtonHandler = null;
  }
  tg.MainButton.hideProgress?.();
  tg.MainButton.enable?.();
  tg.MainButton.hide();
  document.documentElement.classList.remove("tg-main-button-visible");
  requestAnimationFrame(() => applyTelegramLayout());
}

export function setMainButtonProgress(active: boolean): void {
  const tg = getTg();
  if (!tg?.MainButton) return;
  if (active) {
    tg.MainButton.showProgress?.(false);
    tg.MainButton.disable?.();
  } else {
    tg.MainButton.hideProgress?.();
    tg.MainButton.enable?.();
  }
}

export function setupBackButton(onBack: () => void): void {
  const tg = getTg();
  if (!tg?.BackButton) return;

  if (backButtonHandler) {
    tg.BackButton.offClick(backButtonHandler);
  }
  backButtonHandler = onBack;

  tg.BackButton.show();
  tg.BackButton.onClick(onBack);
}

export function hideBackButton(): void {
  const tg = getTg();
  if (!tg?.BackButton) return;

  if (backButtonHandler) {
    tg.BackButton.offClick(backButtonHandler);
    backButtonHandler = null;
  }
  tg.BackButton.hide();
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TgWebApp;
    };
  }
}
