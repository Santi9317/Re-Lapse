import { createHmac } from "node:crypto";

/** Wrong PIN checks for one phone. A browser we have not issued shares one count. */
export const PIN_RESTORE_LIMIT = 8;

/** Rescue requests for one phone. A browser we have not issued shares one window. */
export const PIN_RESCUE_LIMIT = 8;

export function pinRestoreOpen(recentChecks: number): boolean {
  return Number.isFinite(recentChecks) && recentChecks >= 0 && recentChecks < PIN_RESTORE_LIMIT;
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
