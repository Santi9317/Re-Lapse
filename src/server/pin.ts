import { createHmac } from "node:crypto";

/** Wrong PIN checks for one phone. Another phone has its own count. */
export const PIN_RESTORE_LIMIT = 8;

/** Wrong PIN checks for every phone together, so new phones stay bounded. */
export const PIN_RESTORE_LAB = 64;

/** Rescue requests for one phone. Another phone has its own window. */
export const PIN_RESCUE_LIMIT = 8;

/** Rescue requests for every phone together, so new phones stay bounded. */
export const PIN_RESCUE_LAB = 40;

export function pinRestoreOpen(recentChecks: number): boolean {
  return Number.isFinite(recentChecks) && recentChecks >= 0 && recentChecks < PIN_RESTORE_LIMIT;
}

/** Whether the ceiling across every phone still allows another miss. */
export function labPinOpen(recentChecks: number): boolean {
  return Number.isFinite(recentChecks) && recentChecks >= 0 && recentChecks < PIN_RESTORE_LAB;
}

/**
 * A matching name and PIN still open when this count is used up.
 * The count belongs to one phone, or to browsers we have not issued.
 */
export function pinRestoreDecision(matches: boolean, recentChecks: number): "ok" | "wrong" | "blocked" {
  if (matches) return "ok";
  if (!pinRestoreOpen(recentChecks)) return "blocked";
  return "wrong";
}

/** Whether this phone may file another rescue. Another phone is a different count. */
export function rescueRoom(ownRecent: number): boolean {
  return Number.isFinite(ownRecent) && ownRecent >= 0 && ownRecent < PIN_RESCUE_LIMIT;
}

/** Whether any phone may file another rescue. A full ceiling blocks a new phone too. */
export function rescueLabRoom(labRecent: number): boolean {
  return Number.isFinite(labRecent) && labRecent >= 0 && labRecent < PIN_RESCUE_LAB;
}

/** A profile PIN is six digits, including leading zeros. Spaces are not part of it. */
export function normalizePin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const pin = value.trim().replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(pin)) return null;
  return pin;
}

/** Stored form of a PIN. The digits themselves are not the stored value. */
export function profilePinHash(pin: string, secret: Buffer | string): string {
  return createHmac("sha256", secret).update(`relapse-profile-pin-v1\n${pin}`).digest("hex");
}
