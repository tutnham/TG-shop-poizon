import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { proxy } from "./image-proxy.route.js";

describe("image proxy auth", () => {
  const app = new Hono().route("/api/image-proxy", proxy);

  it("returns 401 without initData", async () => {
    const res = await app.request(
      "/api/image-proxy?url=https://cdn.poizon.com/test.jpg",
    );
    assert.equal(res.status, 401);
  });
});
