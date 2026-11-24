/**
 * One booth still has its own small window. A separate ceiling bounds every
 * new id together, because the booth cookie can be dropped and replaced.
 * Address headers are not a booth: the caller can write them. Unclaimed ids
 * past a keep count are dropped.
 */
export const MINT_LIMITS = { perBooth: 4, global: 40 } as const;

export const UNCLAIMED_MINT_KEEP = 400;

export function mintRoom(boothCount: number, globalCount: number): boolean {
  if (!Number.isFinite(boothCount) || !Number.isFinite(globalCount)) return false;
  if (boothCount < 0 || globalCount < 0) return false;
  return boothCount < MINT_LIMITS.perBooth && globalCount < MINT_LIMITS.global;
}
