export const QUICK_STICKER_COUNT = 7;

function unitRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1 - Number.EPSILON;
  return value;
}

function draw(source: readonly string[], count: number, random: () => number): string[] {
  const bag = [...source];
  const n = Math.min(count, bag.length);
  for (let i = 0; i < n; i += 1) {
    const span = bag.length - i;
    const index = i + Math.floor(unitRandom(random) * span);
    const chosen = bag[index] ?? bag[i];
    if (!chosen) continue;
    bag[index] = bag[i] ?? chosen;
    bag[i] = chosen;
  }
  return bag.slice(0, n);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  const left = new Set(a);
  if (left.size !== a.length) return false;
  return b.every((emoji) => left.has(emoji));
}

/**
 * Seven stickers for this double tap.
 * When the pool allows it, none of them were in the previous set.
 */
export function pickQuickStickers(
  pool: readonly string[],
  previous: readonly string[] = [],
  random: () => number = Math.random,
  count = QUICK_STICKER_COUNT,
): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const emoji of pool) {
    if (!emoji || seen.has(emoji)) continue;
    seen.add(emoji);
    unique.push(emoji);
  }
  const want = Math.max(0, Math.min(count, unique.length));
  if (want === 0) return [];

  const banned = new Set(previous);
  const fresh = unique.filter((emoji) => !banned.has(emoji));
  const source = fresh.length >= want ? fresh : unique;
  let picked = draw(source, want, random);
  if (!sameSet(picked, previous)) return picked;

  const outside = unique.filter((emoji) => !banned.has(emoji));
  const replacement = outside[Math.floor(unitRandom(random) * outside.length)];
  if (!replacement) return picked;
  const next = [...picked];
  const swapAt = next.findIndex((emoji) => emoji !== replacement);
  if (swapAt >= 0) next[swapAt] = replacement;
  return next;
}
