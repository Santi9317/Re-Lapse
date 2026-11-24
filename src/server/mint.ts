/**
 * New camera ids are counted for one browser booth, the httpOnly cookie the
 * server sets. Another booth's cameras do not close this booth's window.
 * Address headers are not a booth: the caller can write them. Unclaimed ids
 * past a keep count are dropped so a visitor cannot fill a shared allowance.
 */
export const MINT_LIMITS = { perBooth: 4 } as const;

export const UNCLAIMED_MINT_KEEP = 400;

export function mintRoom(boothCount: number): boolean {
  if (!Number.isFinite(boothCount) || boothCount < 0) return false;
  return boothCount < MINT_LIMITS.perBooth;
}
