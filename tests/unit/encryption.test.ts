import { describe, it, expect } from "vitest";
import { encryptPat, decryptPat } from "@/lib/encryption";

describe("encryptPat / decryptPat", () => {
  it("round-trips: decrypting the output returns the original PAT", () => {
    const pat = "ghp_testtoken1234567890";
    expect(decryptPat(encryptPat(pat))).toBe(pat);
  });

  it("encrypted output does not contain the raw PAT", () => {
    const pat = "ghp_supersecret";
    expect(encryptPat(pat)).not.toContain(pat);
  });

  it("produces different ciphertext on each call (random IV)", () => {
    const pat = "ghp_same_input";
    expect(encryptPat(pat)).not.toBe(encryptPat(pat));
  });

  it("decrypts correctly after multiple encrypt calls", () => {
    const pat = "ghp_multi";
    const enc1 = encryptPat(pat);
    const enc2 = encryptPat(pat);
    expect(decryptPat(enc1)).toBe(pat);
    expect(decryptPat(enc2)).toBe(pat);
  });

  it("throws when the ciphertext is tampered with", () => {
    const enc = encryptPat("ghp_tamper");
    // Flip a byte in the base64 payload
    const tampered = enc.slice(0, -4) + "XXXX";
    expect(() => decryptPat(tampered)).toThrow();
  });
});
