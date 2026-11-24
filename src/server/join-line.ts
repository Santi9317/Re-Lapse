/**
 * The join line is one shared queue. A browser cookie cannot open another
 * line. Pending rows stay within what the portal can show, and new requests
 * in a short window stay within what one sitting can review.
 */
export const JOIN_LIMITS = {
  pendingMax: 80,
  windowMs: 10 * 60_000,
  newPerWindow: 30,
} as const;

export function joinRoom(pending: number, recent: number): boolean {
  if (!Number.isFinite(pending) || !Number.isFinite(recent)) return false;
  if (pending < 0 || recent < 0) return false;
  return pending < JOIN_LIMITS.pendingMax && recent < JOIN_LIMITS.newPerWindow;
}
