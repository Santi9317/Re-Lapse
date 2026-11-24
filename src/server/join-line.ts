/**
 * Each phone has its own join allowance. A full phone does not close the
 * line for anyone else, and one phone cannot fill a shared queue.
 */
export const JOIN_LIMITS = {
  perPhone: 4,
  windowMs: 10 * 60_000,
  listLimit: 80,
} as const;

export function phoneMayJoin(ownRecent: number): boolean {
  if (!Number.isFinite(ownRecent) || ownRecent < 0) return false;
  return ownRecent < JOIN_LIMITS.perPhone;
}
