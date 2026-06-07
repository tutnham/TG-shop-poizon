import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { fetchCnyRubFromCbr } from "./cbr.client.js";

describe("fetchCnyRubFromCbr", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses CNY from Valute object", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        Date: "2026-06-05",
        Valute: { CNY: { Value: 10.9536, Nominal: 1 } },
      }),
    })) as typeof fetch;

    const { rate } = await fetchCnyRubFromCbr();
    assert.equal(rate, 10.9536);
  });
});
