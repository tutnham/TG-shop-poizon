import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import {
  bodySizeLimit,
  DEFAULT_MAX_BODY_BYTES,
} from "./request-body-limit.js";

describe("bodySizeLimit middleware", () => {
  it("allows requests within the limit", async () => {
    const app = new Hono();
    app.use("*", bodySizeLimit());
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Length": "128" },
    });
    assert.equal(res.status, 200);
  });

  it("rejects requests exceeding the limit", async () => {
    const app = new Hono();
    app.use("*", bodySizeLimit());
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      method: "POST",
      headers: {
        "Content-Length": String(DEFAULT_MAX_BODY_BYTES + 1),
      },
    });
    assert.equal(res.status, 413);
  });

  it("rejects invalid Content-Length values", async () => {
    const app = new Hono();
    app.use("*", bodySizeLimit());
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Length": "not-a-number" },
    });
    assert.equal(res.status, 413);
  });
});
