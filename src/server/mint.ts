/**
 * Each phone has its own small window for new camera ids. Another phone's
 * window does not close this one. Address headers are not a phone: the
 * caller can write them. Unclaimed ids past a keep count are dropped.
 */
export const MINT_LIMITS = { perBooth: 4 } as const;

export const UNCLAIMED_MINT_KEEP = 400;

export function mintRoom(boothCount: number): boolean {
  if (!Number.isFinite(boothCount) || boothCount < 0) return false;
  return boothCount < MINT_LIMITS.perBooth;
}
