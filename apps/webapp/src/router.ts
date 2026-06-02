import {
  beginNavigation,
  getNavigationGeneration,
  isCurrentNavigation,
} from "./lib/navigation-guard.js";

type RouteHandler = () => void | Promise<void>;

const routes: Record<string, RouteHandler> = {};
/** Последний валидный маршрут SPA (не сбрасывается при «ломаных» hash от Telegram). */
let currentRoute = "/";
const historyStack: string[] = [];

export function registerRoute(path: string, handler: RouteHandler): void {
  routes[path] = handler;
}

function parseHashPath(): string | null {
  const raw = window.location.hash.slice(1);
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  const pathOnly = raw.split("?")[0]?.split("#")[0] ?? "/";
  return pathOnly || "/";
}

/** Путь SPA: валидный hash или последний сохранённый маршрут. */
export function getCurrentPath(): string {
  const parsed = parseHashPath();
  if (parsed) {
    currentRoute = parsed;
    return parsed;
  }
  return currentRoute || "/";
}

function restoreHashIfNeeded(path: string): void {
  const want = `#${path}`;
  if (window.location.hash !== want) {
    window.history.replaceState(null, "", want);
  }
}

export function navigate(path: string, replace = false): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (currentRoute === normalized && parseHashPath() === normalized) return;

  if (!replace && currentRoute && currentRoute !== normalized) {
    historyStack.push(currentRoute);
  }
  currentRoute = normalized;
  window.location.hash = normalized;
}

export function goBack(): void {
  const prev = historyStack.pop();
  if (prev) {
    currentRoute = prev;
    window.location.hash = prev;
  } else {
    navigate("/", true);
  }
}

export async function handleRoute(): Promise<void> {
  const generation = beginNavigation();
  const path = getCurrentPath();
  restoreHashIfNeeded(path);
  currentRoute = path;

  const runHandler = async (handler: RouteHandler) => {
    await handler();
    if (!isCurrentNavigation(generation)) return;
  };

  const handler = routes[currentRoute];
  if (handler) {
    await runHandler(handler);
    return;
  }

  if (currentRoute.match(/^\/product\//)) {
    const h = routes["/product/:id"];
    if (h) await runHandler(h);
    return;
  }

  if (currentRoute.match(/^\/orders\//)) {
    const h = routes["/orders/:id"];
    if (h) await runHandler(h);
    return;
  }

  const home = routes["/"];
  if (home) await runHandler(home);
}

export function getRouteParam(name: string): string | null {
  const path = getCurrentPath();
  if (name === "id") {
    const m = path.match(/\/(?:product|orders)\/([^/]+)/);
    return m?.[1] ?? null;
  }
  return null;
}

export function startRouter(): void {
  const parsed = parseHashPath();
  if (parsed) currentRoute = parsed;

  window.addEventListener("hashchange", () => void handleRoute());
  void handleRoute();
}

export { getNavigationGeneration };
