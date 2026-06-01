type RouteHandler = () => void | Promise<void>;

const routes: Record<string, RouteHandler> = {};
let currentRoute = "";
const historyStack: string[] = [];

export function registerRoute(path: string, handler: RouteHandler): void {
  routes[path] = handler;
}

export function navigate(path: string, replace = false): void {
  if (!replace && currentRoute) historyStack.push(currentRoute);
  currentRoute = path;
  window.location.hash = path;
}

export function goBack(): void {
  const prev = historyStack.pop();
  if (prev) {
    currentRoute = prev;
    window.location.hash = prev;
  } else {
    navigate("#/", true);
  }
}

export async function handleRoute(): Promise<void> {
  const hash = window.location.hash.slice(1) || "/";
  currentRoute = hash.startsWith("/") ? hash : `/${hash}`;

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
  const hash = window.location.hash.slice(1) || "/";
  if (name === "id") {
    const m = hash.match(/\/(?:product|orders)\/([^/]+)/);
    return m?.[1] ?? null;
  }
  return null;
}

export function startRouter(): void {
  window.addEventListener("hashchange", () => void handleRoute());
  void handleRoute();
}
