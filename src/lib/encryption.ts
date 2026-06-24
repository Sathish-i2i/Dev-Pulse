import * as crypto from "crypto";

const keyHex = process.env.PAT_ENCRYPTION_KEY;
if (!keyHex || Buffer.from(keyHex, "hex").length !== 32) {
  throw new Error(
    "Fatal: PAT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)"
  );
}

const ENCRYPTION_KEY = Buffer.from(keyHex, "hex");

type EncryptedBlob = {
  iv: string;
  ciphertext: string;
  tag: string;
};

export function encryptPat(pat: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(pat, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const blob: EncryptedBlob = {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };

  return Buffer.from(JSON.stringify(blob)).toString("base64");
}

export function decryptPat(stored: string): string {
  const blob: EncryptedBlob = JSON.parse(
    Buffer.from(stored, "base64").toString("utf8")
  );

  const iv = Buffer.from(blob.iv, "base64");
  const ciphertext = Buffer.from(blob.ciphertext, "base64");
  const tag = Buffer.from(blob.tag, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
