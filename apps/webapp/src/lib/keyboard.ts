/** Скрыть экранную клавиатуру (Telegram WebView / mobile Safari). */
export function hideKeyboard(): void {
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

export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest("input, textarea, select, [contenteditable='true']")) {
    return true;
  }
  // Тап по <label> или подписи поля не должен закрывать клавиатуру до фокуса на input.
  const label = el.closest("label");
  return !!label?.querySelector("input, textarea, select");
}

function shouldDismissKeyboard(): boolean {
  return !isEditableElement(document.activeElement);
}

/** Скрывать клавиатуру при тапе вне полей ввода и при скролле. */
export function bindKeyboardDismiss(root: HTMLElement): void {
  root.addEventListener(
    "pointerdown",
    (e) => {
      if (!isEditableElement(e.target)) hideKeyboard();
    },
    { passive: true },
  );

  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const onScroll = (): void => {
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

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      hideKeyboard();
    }
  });

  input.addEventListener("blur", () => {
    requestAnimationFrame(() => hideKeyboard());
  });
}
