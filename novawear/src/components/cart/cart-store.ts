"use client";

import { useSyncExternalStore } from "react";
import type { Category } from "@prisma/client";
import { cartRules } from "@/config/shop";

/**
 * The bag lives in localStorage so visitors can shop before signing in.
 * Prices here are for display only — the server re-reads every price,
 * colour, size and availability when the order is placed.
 */

export type CartLine = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  category: Category;
  price: number;
  colorName: string;
  colorHex: string;
  size: string;
  quantity: number;
  preorder: boolean;
  imageId: string | null;
};

const KEY = "novawear_bag_v1";
const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
let cache: CartLine[] | null = null;

function isLine(x: unknown): x is CartLine {
  const l = x as CartLine;
  return (
    !!l &&
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    typeof l.price === "number" &&
    typeof l.colorName === "string" &&
    typeof l.size === "string" &&
    Number.isInteger(l.quantity) &&
    l.quantity > 0
  );
}

function read(): CartLine[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter(isLine).slice(0, cartRules.maxLines) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(lines: CartLine[]) {
  cache = lines;
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Private mode or storage full — the bag still works for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const lineKey = (productId: string, colorName: string, size: string) => `${productId}|${colorName}|${size}`;

export const ADDED_EVENT = "novawear:added";

export function addToBag(line: Omit<CartLine, "key">) {
  const key = lineKey(line.productId, line.colorName, line.size);
  const lines = read();
  const existing = lines.find((l) => l.key === key);
  const next = existing
    ? lines.map((l) => (l.key === key ? { ...l, ...line, key, quantity: Math.min(cartRules.maxQuantity, l.quantity + line.quantity) } : l))
    : [...lines, { ...line, key }].slice(-cartRules.maxLines);
  write(next);
  window.dispatchEvent(new CustomEvent(ADDED_EVENT, { detail: { ...line, key } }));
}

export function setQuantity(key: string, quantity: number) {
  write(read().map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(cartRules.maxQuantity, quantity)) } : l)));
}

export function removeFromBag(key: string) {
  write(read().filter((l) => l.key !== key));
}

export function clearBag() {
  write(EMPTY);
}

export function useBag() {
  const lines = useSyncExternalStore(subscribe, read, () => EMPTY);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.quantity * l.price, 0);
  return { lines, count, subtotal, hasPreorder: lines.some((l) => l.preorder) };
}
