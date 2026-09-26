import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A real hash used to keep timing similar when a user does not exist. */
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string) {
  dummyHash ??= hashPassword("movera-timing-safe-dummy-password");
  await verifyPassword(await dummyHash, password);
  return false;
}
