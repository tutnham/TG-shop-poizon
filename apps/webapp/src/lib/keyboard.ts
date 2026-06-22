/** Скрыть экранную клавиатуру (Telegram WebView / mobile Safari). */
export function hideKeyboard(): void {
  if (keyboardDismissPaused) return;

  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }

  const tg = window.Telegram?.WebApp as
    | { hideKeyboard?: () => void }
    | undefined;
  tg?.hideKeyboard?.();

  const trap = document.createElement("input");
  trap.setAttribute("readonly", "true");
  trap.setAttribute("aria-hidden", "true");
  trap.tabIndex = -1;
  trap.style.cssText =
    "position:fixed;opacity:0;height:0;width:0;top:0;left:0;pointer-events:none";
  document.body.appendChild(trap);
  trap.focus({ preventScroll: true });
  trap.blur();
  trap.remove();
}

let keyboardDismissPaused = false;
let editableFocusedAt = 0;

function noteEditableFocus(): void {
  editableFocusedAt = Date.now();
}

function isWithinEditableFocusGrace(ms = 450): boolean {
  return Date.now() - editableFocusedAt < ms;
}

export { isWithinEditableFocusGrace };

/** Отключить автозакрытие клавиатуры (checkout и другие формы). */
export function setKeyboardDismissPaused(paused: boolean): void {
  keyboardDismissPaused = paused;
}

export function isKeyboardDismissPaused(): boolean {
  return keyboardDismissPaused;
}

function isCheckoutFormElement(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest(".checkout-form");
}

export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest("input, textarea, select, [contenteditable='true']")) {
    return true;
  }
  // Тап по области search-bar / import — фокус на input, не закрываем клавиатуру.
  if (el.closest(".search-bar, .search-section")) return true;
  // Тап по <label> или подписи поля не должен закрывать клавиатуру до фокуса на input.
  const label = el.closest("label");
  if (label?.querySelector("input, textarea, select")) return true;
  // Тап по области формы checkout (отступы между полями) не должен сбрасывать ввод.
  return isCheckoutFormElement(el);
}

function focusSearchBarInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const bar = el.closest(".search-bar, .search-section");
  if (!bar) return false;
  const input = bar.querySelector("input");
  if (!(input instanceof HTMLInputElement)) return false;
  noteEditableFocus();
  if (document.activeElement !== input) {
    input.focus();
  }
  return true;
}

function shouldDismissKeyboard(): boolean {
  if (keyboardDismissPaused) return false;
  const active = document.activeElement;
  if (isEditableElement(active)) return false;
  return !isCheckoutFormElement(active);
}

/** Скрывать клавиатуру при тапе вне полей ввода и при скролле. */
export function bindKeyboardDismiss(root: HTMLElement): void {
  root.addEventListener(
    "pointerdown",
    (e) => {
      if (keyboardDismissPaused) return;
      if (isEditableElement(e.target)) return;
      if (focusSearchBarInput(e.target)) return;
      hideKeyboard();
    },
    { passive: true },
  );

  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const onScroll = (): void => {
    if (keyboardDismissPaused || isWithinEditableFocusGrace()) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (shouldDismissKeyboard()) hideKeyboard();
    }, 80);
  };

  root.addEventListener("scroll", onScroll, { passive: true, capture: true });
  // Открытие клавиатуры в WebView часто вызывает scroll на window/document.
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
}

export function wireSearchInput(input: HTMLInputElement): void {
  input.setAttribute("enterkeyhint", "search");
  input.setAttribute("inputmode", "search");
  input.addEventListener("focus", noteEditableFocus);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      hideKeyboard();
    }
  });
}

/** Поле ввода без автозакрытия клавиатуры на blur (импорт артикула и т.п.). */
export function wireFormInput(input: HTMLInputElement): void {
  input.addEventListener("focus", noteEditableFocus);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      hideKeyboard();
    }
  });
}
