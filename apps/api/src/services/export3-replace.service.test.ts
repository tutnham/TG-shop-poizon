import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectStaleProducts } from "./export3-replace.service.js";

describe("export3 replace service", () => {
  it("selects stale products from every source for full catalog replacement", () => {
    const stale = selectStaleProducts(
      [
        { id: "uuid-1", poizon_id: "100", source: "poizon" },
        { id: "uuid-2", poizon_id: "200", source: "user_import" },
        { id: "uuid-3", poizon_id: "300", source: "poizon" },
      ],
      new Set(["100"]),
    );

    assert.deepEqual(
      stale.map((row) => row.poizon_id),
      ["200", "300"],
    );
  });

  it("can preserve user_import rows when legacy poizon-only mode is requested", () => {
    const stale = selectStaleProducts(
      [
        { id: "uuid-1", poizon_id: "100", source: "poizon" },
        { id: "uuid-2", poizon_id: "200", source: "user_import" },
        { id: "uuid-3", poizon_id: "300", source: "poizon" },
      ],
      new Set(["100"]),
      { poizonOnly: true },
    );

    assert.deepEqual(
      stale.map((row) => row.poizon_id),
      ["300"],
    );
  });
});
