import {
  getNavigationGeneration,
  isCurrentNavigation,
} from "./navigation-guard.js";

/** Snapshot текущего поколения навигации для отмены устаревших render*. */
export function capturePageRenderGeneration(): number {
  return getNavigationGeneration();
}

export function isActivePageRender(generation: number): boolean {
  return isCurrentNavigation(generation);
}
