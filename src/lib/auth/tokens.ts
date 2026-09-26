import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 160 bits of entropy, URL-safe. */
export function generateToken() {
  return randomBytes(20).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
