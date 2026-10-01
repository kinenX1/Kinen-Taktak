import "server-only";
import { randomInt } from "node:crypto";

// No 0/O/1/I to keep references easy to read aloud.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateReference() {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `NW-${out}`;
}
