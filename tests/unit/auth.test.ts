import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "@/lib/auth";

describe("generateToken", () => {
  it("returns a UUID-format string", () => {
    const token = generateToken();
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("returns a different value on each call", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe("hashToken", () => {
  it("returns a 64-character hex string", () => {
    const h = hashToken("test-token");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("is not idempotent — hashing a hash changes the value", () => {
    const h = hashToken("raw");
    expect(hashToken(h)).not.toBe(h);
  });
});
