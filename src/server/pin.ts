import { createHmac } from "node:crypto";

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
