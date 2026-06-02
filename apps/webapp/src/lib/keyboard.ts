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
  return (
    el instanceof HTMLElement &&
    !!el.closest("input, textarea, select, [contenteditable='true']")
  );
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
  root.addEventListener(
    "scroll",
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => hideKeyboard(), 80);
    },
    { passive: true, capture: true },
  );
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
