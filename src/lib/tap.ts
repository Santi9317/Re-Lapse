export type TapPoint = { x: number; y: number; at: number };

export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_SLOP = 48;

export function isDoubleTap(
  previous: TapPoint | null,
  next: TapPoint,
  windowMs = DOUBLE_TAP_MS,
  slopPx = DOUBLE_TAP_SLOP,
): boolean {
  if (!previous) return false;
  const elapsed = next.at - previous.at;
  if (!(elapsed > 0) || elapsed > windowMs) return false;
  return Math.hypot(next.x - previous.x, next.y - previous.y) <= slopPx;
}

/** A second tap on the viewfinder, or the empty space around the frame, flips the camera. A pinch, or a tap on a button, does not. */
export function shouldFlipOnDoubleTap(input: {
  live: boolean;
  onControl: boolean;
  pinched: boolean;
  previous: TapPoint | null;
  next: TapPoint;
}): boolean {
  if (!input.live || input.onControl || input.pinched) return false;
  return isDoubleTap(input.previous, input.next);
}
