/**
 * Each phone has a small window for new camera ids. Another phone's window
 * does not close this one. The whole lab also has a ceiling, so new phones
 * cannot mint without a bound. Address headers are not a phone: the caller
 * can write them. Unclaimed ids past a keep count are dropped.
 */
export const MINT_LIMITS = { perPhone: 4, labWindow: 48 } as const;

export const UNCLAIMED_MINT_KEEP = 400;

export function mintRoom(phoneCount: number, labCount = 0): boolean {
  if (!Number.isFinite(phoneCount) || phoneCount < 0) return false;
  if (!Number.isFinite(labCount) || labCount < 0) return false;
  return phoneCount < MINT_LIMITS.perPhone && labCount < MINT_LIMITS.labWindow;
}
