let navigationGeneration = 0;

export function beginNavigation(): number {
  navigationGeneration += 1;
  return navigationGeneration;
}

export function getNavigationGeneration(): number {
  return navigationGeneration;
}

export function isCurrentNavigation(generation: number): boolean {
  return generation === navigationGeneration;
}
