import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canTransition } from "./order.service.js";

describe("OrderService FSM", () => {
  it("allows pending → confirmed", () => {
    assert.equal(canTransition("pending", "confirmed"), true);
  });

  it("denies delivered → pending", () => {
    assert.equal(canTransition("delivered", "pending"), false);
  });

  it("denies pending → paid from delivered path", () => {
    assert.equal(canTransition("delivered", "paid"), false);
  });

  it("allows confirmed → paid", () => {
    assert.equal(canTransition("confirmed", "paid"), true);
  });

  it("allows paid → processing", () => {
    assert.equal(canTransition("paid", "processing"), true);
  });

  it("denies cancelled → paid", () => {
    assert.equal(canTransition("cancelled", "paid"), false);
  });
});
