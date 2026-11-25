/**
 * Each phone has a small window for new camera ids. A new booth on that
 * phone uses the same window, so dropping the cookie does not start over.
 * Another phone's window does not close this one. Address headers are not a
 * phone: the caller can write them. Unclaimed ids past a keep count are dropped.
 */
export const MINT_LIMITS = { perPhone: 4 } as const;

export const UNCLAIMED_MINT_KEEP = 400;

export function mintRoom(phoneCount: number): boolean {
  if (!Number.isFinite(phoneCount) || phoneCount < 0) return false;
  return phoneCount < MINT_LIMITS.perPhone;
}
