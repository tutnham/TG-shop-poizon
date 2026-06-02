const boundNavs = new WeakSet<HTMLElement>();

/** Держит нижнее меню над клавиатурой (visualViewport). */
export function bindBottomNavToVisualViewport(nav: HTMLElement): void {
  if (boundNavs.has(nav)) return;
  boundNavs.add(nav);

  const update = (): void => {
    const vv = window.visualViewport;
    if (!vv) {
      nav.style.removeProperty("transform");
      return;
    }
    const keyboardGap = Math.max(
      0,
      window.innerHeight - vv.height - vv.offsetTop,
    );
    nav.style.transform =
      keyboardGap > 0 ? `translateY(-${keyboardGap}px)` : "";
  };

  window.visualViewport?.addEventListener("resize", update);
  window.visualViewport?.addEventListener("scroll", update);
  update();
}
