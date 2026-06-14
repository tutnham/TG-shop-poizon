import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../apps/api/src/app.js";

const app = createApp();

/**
 * Vercel Node.js Functions pass a Node IncomingMessage (and a ServerResponse)
 * to the default export. Hono's middleware (cors, etc.) expects a Web Request
 * with a Headers object. We bridge the two here.
 *
 * We buffer the entire request body before creating the Web Request to avoid
 * issues with Readable.toWeb() + duplex:"half" which can hang on Vercel.
 */
async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const protocol =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ??
    (req.headers.host as string | undefined) ??
    "localhost";
  const url = `${protocol}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  const skipHeaders = new Set([
    "transfer-encoding",
    "content-length",
    "connection",
    "keep-alive",
  ]);
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || skipHeaders.has(key)) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, String(value));
    }
  }

  const method = (req.method ?? "GET").toUpperCase();
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const bodyBuf = Buffer.concat(chunks);
    init.body = new Uint8Array(bodyBuf);
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
    const request = await toWebRequest(req);
    const response = await app.fetch(request);
    await writeWebResponse(res, response);
  } catch (err) {
    console.error(
      "[api] handler error",
      err instanceof Error ? err.message : err,
    );
    console.error(
      "[api:handler:stack]",
      err instanceof Error ? err.stack : "no stack",
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
