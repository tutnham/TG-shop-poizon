import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { createApp } from "../apps/api/src/app.js";

const app = createApp();

/**
 * Vercel Node.js Functions pass a Node IncomingMessage (and a ServerResponse)
 * to the default export. Hono's middleware (cors, etc.) expects a Web Request
 * with a Headers object. We bridge the two here.
 *
 * Without this adapter, hono/vercel's `handle` would call `app.fetch(req)`
 * directly on the IncomingMessage, and `c.req.header()` would crash trying to
 * call `.get(...)` on the plain object form of Node headers.
 */
function toWebRequest(req: IncomingMessage): Request {
  const protocol =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ??
    (req.headers.host as string | undefined) ??
    "localhost";
  const url = `${protocol}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, String(value));
    }
  }

  const method = (req.method ?? "GET").toUpperCase();
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(req) as unknown as BodyInit;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function writeWebResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const request = toWebRequest(req);
    const response = await app.fetch(request);
    await writeWebResponse(res, response);
  } catch (err) {
    console.error("[api] handler error", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
