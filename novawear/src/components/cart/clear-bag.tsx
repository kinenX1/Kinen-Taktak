"use client";

import { useEffect } from "react";
import { clearBag } from "./cart-store";

/** Empties the bag once an order has been placed. */
export function ClearBagOnMount() {
  useEffect(() => {
    clearBag();
  }, []);
  return null;
}
