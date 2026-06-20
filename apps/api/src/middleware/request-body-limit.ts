import { createMiddleware } from "hono/factory";

export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

/** Rejects requests whose Content-Length exceeds maxBytes (DoS guard). */
export function bodySizeLimit(maxBytes = DEFAULT_MAX_BODY_BYTES) {
  return createMiddleware(async (c, next) => {
    const raw = c.req.header("content-length");
    if (raw) {
      const length = Number.parseInt(raw, 10);
      if (!Number.isFinite(length) || length < 0 || length > maxBytes) {
        return c.json({ error: "Payload too large" }, 413);
      }
    }
    await next();
  });
}
