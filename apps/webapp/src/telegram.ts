export function getTg() {
  return window.Telegram?.WebApp;
}

export function initTelegram(): void {
  const tg = getTg();
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#0f1115");
  tg.setBackgroundColor("#0f1115");
  tg.enableClosingConfirmation();
}

export function haptic(type: "light" | "medium" | "success" = "light"): void {
  const tg = getTg();
  if (!type) return;
  if (type === "success") tg?.HapticFeedback?.notificationOccurred("success");
  else tg?.HapticFeedback?.impactOccurred(type);
}

export function showMainButton(text: string, onClick: () => void): void {
  const tg = getTg();
  if (!tg?.MainButton) return;
  tg.MainButton.setText(text);
  tg.MainButton.show();
  tg.MainButton.onClick(onClick);
}

export function hideMainButton(): void {
  const tg = getTg();
  tg?.MainButton.hide();
  tg?.MainButton.offClick(() => {});
}

export function setupBackButton(onBack: () => void): void {
  const tg = getTg();
  if (!tg?.BackButton) return;
  tg.BackButton.show();
  tg.BackButton.onClick(onBack);
}

export function hideBackButton(): void {
  getTg()?.BackButton.hide();
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: { user?: { language_code?: string } };
        ready: () => void;
        expand: () => void;
        setHeaderColor: (c: string) => void;
        setBackgroundColor: (c: string) => void;
        enableClosingConfirmation: () => void;
        MainButton: {
          setText: (t: string) => void;
          show: () => void;
          hide: () => void;
          onClick: (fn: () => void) => void;
          offClick: (fn: () => void) => void;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (fn: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (s: string) => void;
          notificationOccurred: (s: string) => void;
        };
        showAlert: (msg: string) => void;
        openLink: (url: string) => void;
      };
    };
  }
}
