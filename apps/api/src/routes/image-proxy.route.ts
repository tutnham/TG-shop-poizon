import { Hono } from "hono";
import { isAllowedImageUrl } from "../lib/image-proxy.js";

const proxy = new Hono();

proxy.get("/", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "url required" }, 400);
  if (!isAllowedImageUrl(url)) {
    return c.json({ error: "Host not allowed" }, 403);
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return c.json({ error: "Upstream error" }, 502);

    const ct = res.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) {
      return c.json({ error: "Not an image" }, 400);
    }

    // Limit response to 5 MB to prevent memory exhaustion
    const MAX_SIZE = 5 * 1024 * 1024;
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_SIZE) {
      return c.json({ error: "Image too large" }, 400);
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_SIZE) {
      return c.json({ error: "Image too large" }, 400);
    }

    return new Response(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return c.json({ error: "Upstream timeout" }, 504);
    }
    return c.json({ error: "Fetch failed" }, 502);
  }
});

export { proxy };
