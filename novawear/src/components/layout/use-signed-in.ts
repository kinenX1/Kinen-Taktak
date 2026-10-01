"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const read = () => document.cookie.split("; ").some((c) => c === "novawear_signed_in=1");

/** Reads the non-sensitive signed-in hint cookie (UI only, never for access control). */
export function useSignedIn() {
  return useSyncExternalStore(subscribe, read, () => false);
}
