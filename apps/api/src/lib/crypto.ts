import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const key = Buffer.from(env.ENCRYPTION_KEY, "base64");

/** AES-256-GCM. Saída: base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Token assinado e com validade, usado como `state` no OAuth. */
export function signState(value: string, ttlSeconds = 15 * 60): string {
  const body = `${value}.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${Buffer.from(body).toString("base64url")}.${sig}`;
}

export function verifyState(token: string): string | null {
  const [bodyB64, sig] = token.split(".");
  if (!bodyB64 || !sig) return null;
  const body = Buffer.from(bodyB64, "base64url").toString();
  const expected = createHmac("sha256", key).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const dot = body.lastIndexOf(".");
  if (Number(body.slice(dot + 1)) < Date.now() / 1000) return null;
  return body.slice(0, dot);
}
