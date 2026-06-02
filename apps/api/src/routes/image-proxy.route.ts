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
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return c.json({ error: "Upstream error" }, 502);
    const buf = await res.arrayBuffer();
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) {
      return c.json({ error: "Not an image" }, 400);
    }
    return new Response(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return c.json({ error: "Fetch failed" }, 502);
  }
});

export { proxy };
