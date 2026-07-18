import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption for integration tokens at rest.
 * Key comes from TOKEN_ENCRYPTION_KEY (base64, 32 bytes). If it isn't set we
 * fall back to storing plaintext (dev only) so the flow still works — the
 * settings page warns when this is the case.
 */

function getKey(): Buffer | null {
  if (!env.TOKEN_ENCRYPTION_KEY) return null;
  try {
    const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext; // dev fallback
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptToken(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!stored.startsWith("enc:")) return stored; // plaintext / dev fallback
  const key = getKey();
  if (!key) return "";
  const [, ivB64, tagB64, dataB64] = stored.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
