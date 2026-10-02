import "server-only";
import { randomInt } from "node:crypto";

// No 0/O/1/I to keep references easy to read aloud.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** e.g. MV-7K3Q9P for project requests, JA-… for job applications. */
export function generateReference(prefix = "MV") {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${out}`;
}
