import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedImageUrl } from "../lib/image-proxy.js";

describe("isAllowedImageUrl", () => {
  it("allows known CDN hosts", () => {
    assert.equal(
      isAllowedImageUrl("https://images.unsplash.com/photo-1"),
      true,
    );
  });

  it("blocks arbitrary hosts", () => {
    assert.equal(isAllowedImageUrl("https://evil.com/image.jpg"), false);
  });

  it("blocks non-http protocols", () => {
    assert.equal(isAllowedImageUrl("file:///etc/passwd"), false);
  });

  it("blocks internal IPs", () => {
    assert.equal(
      isAllowedImageUrl("http://169.254.169.254/latest/meta-data"),
      false,
    );
  });
});
