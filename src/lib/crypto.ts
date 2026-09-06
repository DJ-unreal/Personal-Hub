import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { secrets } from "@/lib/secrets";

/* =====================================================================
   Crypto helpers (server-only).

   - encryptJSON / decryptJSON: AES-256-GCM at-rest encryption for the
     protected tier (budget now; health metadata in step 7). Output is
     base64(iv[12] || tag[16] || ciphertext).
   - sign / unsign: HMAC-SHA256 integrity tag for the session cookie so a
     forged/tampered id is rejected before it ever hits the session store.
   ===================================================================== */

function encryptionKey(): Buffer {
  const raw = secrets.encryptionKey();
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (hex or base64)");
  }
  return buf;
}

export function encryptJSON(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptJSON<T>(blob: string): T {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function sign(value: string): string {
  const mac = createHmac("sha256", secrets.sessionSecret())
    .update(value)
    .digest("base64url");
  return `${value}.${mac}`;
}

export function unsign(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const expected = createHmac("sha256", secrets.sessionSecret())
    .update(value)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return value;
}
