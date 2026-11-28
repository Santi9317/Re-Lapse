/** Edge spots, as top percent then left percent. The middle of the photo stays clear. */
export const STICKER_SLOTS: readonly [number, number][] = [
  [10, 12],
  [10, 88],
  [24, 8],
  [24, 92],
  [76, 10],
  [76, 90],
  [90, 20],
  [90, 80],
  [48, 8],
  [48, 92],
  [36, 14],
  [62, 86],
  [36, 86],
  [62, 14],
  [90, 50],
  [12, 50],
  [50, 22],
  [50, 78],
  [20, 30],
  [20, 70],
  [80, 30],
  [80, 70],
  [32, 50],
  [68, 50],
];

const EDGE = 8;
const GAP = 14;

/** Left and top percent for the sticker at this index. */
export function stickerSpot(index: number): { x: number; y: number } {
  const slot = STICKER_SLOTS[index % STICKER_SLOTS.length] ?? [12, 12];
  return { y: slot[0], x: slot[1] };
}

export function stickerTilt(index: number): number {
  return (index % 2 === 0 ? -1 : 1) * (6 + (index % 5) * 2);
}

/** A stored point, or the slot for this index when the row has none yet. */
export function readStickerSpot(x: unknown, y: unknown, index: number): { x: number; y: number } {
  if (x == null || y == null || x === "" || y === "") return stickerSpot(index);
  const nx = typeof x === "number" ? x : Number(x);
  const ny = typeof y === "number" ? y : Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return stickerSpot(index);
  return { x: nx, y: ny };
}

/** The first open edge spot, so a new emoji does not land on one already there. */
export function nextStickerSpot(taken: readonly { x: number; y: number }[]): { x: number; y: number } {
  const open = (spot: { x: number; y: number }) =>
    taken.every((pin) => Math.hypot(pin.x - spot.x, pin.y - spot.y) >= GAP);
  for (let index = 0; index < STICKER_SLOTS.length; index += 1) {
    const spot = stickerSpot(index);
    if (open(spot)) return spot;
  }
  return stickerSpot(taken.length);
}

/** The person who placed the emoji, and the person who shot the frame, can drag it. */
export function canMoveSticker(input: { onFeed: boolean; stickerMine: boolean; frameMine: boolean }): boolean {
  if (!input.onFeed) return false;
  return input.stickerMine || input.frameMine;
}

/** Keep a dragged sticker on the photo. */
export function clampStickerPoint(x: number, y: number): { x: number; y: number } {
  const clamp = (value: number) => Math.min(100 - EDGE, Math.max(EDGE, value));
  return {
    x: Math.round(clamp(x) * 10) / 10,
    y: Math.round(clamp(y) * 10) / 10,
  };
}
