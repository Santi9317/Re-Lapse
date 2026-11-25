/**
 * New join requests share one short line, so a new browser cannot fill it.
 * Each phone has a smaller allowance inside that line. A new booth on that
 * phone uses the same allowance. Dropping the cookie does not open another.
 */
export const JOIN_LIMITS = {
  perPhone: 4,
  pendingMax: 12,
  newPerWindow: 8,
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

/** Shared line first, then this phone. A known camera uses the same answer. */
export function joinAllowed(
  pending: number,
  recent: number,
  ownRecent: number,
): "ok" | "shared" | "phone" {
  if (!joinRoom(pending, recent)) return "shared";
  if (!phoneMayJoin(ownRecent)) return "phone";
  return "ok";
}
