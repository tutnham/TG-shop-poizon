const boundNavs = new WeakSet<HTMLElement>();

const KEYBOARD_GAP_THRESHOLD = 72;

/** Скрывает нижнее меню при открытой клавиатуре вместо сдвига вверх. */
export function bindBottomNavToVisualViewport(nav: HTMLElement): void {
  if (boundNavs.has(nav)) return;
  boundNavs.add(nav);

  const update = (): void => {
    const vv = window.visualViewport;
    if (!vv) {
      nav.style.removeProperty("transform");
      nav.style.removeProperty("visibility");
      nav.style.removeProperty("pointer-events");
      return;
    }

    const keyboardGap = Math.max(
      0,
      window.innerHeight - vv.height - vv.offsetTop,
    );

    if (keyboardGap > KEYBOARD_GAP_THRESHOLD) {
      nav.style.transform = "";
      nav.style.visibility = "hidden";
      nav.style.pointerEvents = "none";
    } else {
      nav.style.removeProperty("transform");
      nav.style.visibility = "";
      nav.style.pointerEvents = "";
    }
  };

  window.visualViewport?.addEventListener("resize", update);
  window.visualViewport?.addEventListener("scroll", update);
  update();
}
