/**
 * New phones share one window. Dropping the booth cookie does not open
 * another. A phone that already has an id keeps its own allowance.
 */
export const BOOTH_LIMITS = {
  newPerWindow: 30,
  windowMs: 10 * 60_000,
} as const;

export function boothRoom(recentNew: number): boolean {
  if (!Number.isFinite(recentNew) || recentNew < 0) return false;
  return recentNew < BOOTH_LIMITS.newPerWindow;
}
