/**
 * New camera ids are counted per browser booth, an httpOnly cookie the server
 * sets. One booth cannot spend the whole lab's budget. Address headers are
 * not a booth: they can be written by the caller. The global number is only
 * a ceiling so throwing the cookie away cannot mint without a bound.
 */
export const MINT_LIMITS = { perBooth: 4, global: 80 } as const;

export function mintRoom(boothCount: number, globalCount: number): boolean {
  if (!Number.isFinite(boothCount) || !Number.isFinite(globalCount)) return false;
  if (boothCount < 0 || globalCount < 0) return false;
  return boothCount < MINT_LIMITS.perBooth && globalCount < MINT_LIMITS.global;
}
