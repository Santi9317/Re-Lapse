/** How far a finger travels before the pull is a gesture, not a tap. */
export const PULL_SLOP = 10;

/** Damped distance that commits a refresh. A shorter pull springs back. */
export const PULL_THRESHOLD = 68;

/** Furthest the surface follows the finger. */
export const PULL_MAX = 116;

/** Where the indicator rests while the tab reloads. */
export const PULL_HOLD = 64;

/** The refreshing mark stays up long enough to see, even when the reload is quick. */
export const PULL_MIN_VISIBLE_MS = 450;

export type PullMove = "pending" | "pull" | "cancel";

/** Rubber-band: more finger travel buys less distance, and it never passes the max. */
export function dampPull(raw: number, max = PULL_MAX): number {
  if (!(raw > 0) || !(max > 0)) return 0;
  const dampened = max * (1 - Math.exp(-raw / (max * 0.72)));
  return Math.min(max, dampened);
}

export function pullCommits(pulled: number, threshold = PULL_THRESHOLD): boolean {
  return pulled >= threshold;
}

/**
 * A pull can start at the top of the scroller.
 * A field or an open sheet is left alone. A second finger is a pinch, not a pull.
 * Buttons can start a pull: a short touch still clicks, a downward drag does not.
 */
export function pullArm(input: {
  scrollTop: number;
  onField: boolean;
  onDialog: boolean;
  pointers: number;
}): boolean {
  if (input.onField || input.onDialog || input.pointers !== 1) return false;
  return input.scrollTop <= 1;
}

/** Downward travel at the top pulls. Sideways, upward, or a scrolled list cancels. */
export function pullMove(input: { dx: number; dy: number; scrollTop: number }): PullMove {
  if (input.scrollTop > 1) return "cancel";
  const adx = Math.abs(input.dx);
  const ady = Math.abs(input.dy);
  if (adx < PULL_SLOP && ady < PULL_SLOP) return "pending";
  if (input.dy <= 0 || adx > ady) return "cancel";
  return "pull";
}

/** Claim the gesture before the browser turns a downward move at the top into overscroll. */
export function shouldHoldPull(input: { dy: number; dx: number; scrollTop: number }): boolean {
  if (input.scrollTop > 1 || input.dy <= 0) return false;
  return input.dy >= Math.abs(input.dx);
}
