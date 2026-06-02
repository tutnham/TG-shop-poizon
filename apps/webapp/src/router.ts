type RouteHandler = () => void | Promise<void>;

const routes: Record<string, RouteHandler> = {};
let currentRoute = "";
const historyStack: string[] = [];

export function registerRoute(path: string, handler: RouteHandler): void {
  routes[path] = handler;
}

/** Путь SPA из hash (#/cart). Не-маршрутные фрагменты (tgWebAppData) → главная. */
export function getCurrentPath(): string {
  const raw = window.location.hash.slice(1);
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  const pathOnly = raw.split("?")[0]?.split("#")[0] ?? "/";
  return pathOnly || "/";
}

export function navigate(path: string, replace = false): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!replace && currentRoute) historyStack.push(currentRoute);
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
  currentRoute = getCurrentPath();

  const handler = routes[currentRoute];
  if (handler) {
    await handler();
    return;
  }

  if (currentRoute.match(/^\/product\//)) {
    const h = routes["/product/:id"];
    if (h) await h();
    return;
  }

  if (currentRoute.match(/^\/orders\//)) {
    const h = routes["/orders/:id"];
    if (h) await h();
    return;
  }

  const home = routes["/"];
  if (home) await home();
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
  window.addEventListener("hashchange", () => void handleRoute());
  void handleRoute();
}
