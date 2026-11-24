/**
 * New join requests share one line. Dropping the booth cookie does not open
 * another budget. Each phone also has a smaller allowance inside that line.
 */
export const JOIN_LIMITS = {
  perPhone: 4,
  pendingMax: 80,
  newPerWindow: 30,
  windowMs: 10 * 60_000,
  listLimit: 80,
} as const;

export function phoneMayJoin(ownRecent: number): boolean {
  if (!Number.isFinite(ownRecent) || ownRecent < 0) return false;
  return ownRecent < JOIN_LIMITS.perPhone;
}

export function joinRoom(pending: number, recent: number): boolean {
  if (!Number.isFinite(pending) || !Number.isFinite(recent)) return false;
  if (pending < 0 || recent < 0) return false;
  return pending < JOIN_LIMITS.pendingMax && recent < JOIN_LIMITS.newPerWindow;
}
