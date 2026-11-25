/**
 * Product waits:
 * - personal frames: uniform 5 to 30 minutes, then the shooter develops to see the frame and chooses whether to share it
 * - events: open for the chosen 1–24 hours from the chosen start, then hidden for 24 hours
 *
 * RELAPSE_DEV_CLOCK is a local-only switch for proving that state machine.
 * The published app does not set it. A request header cannot shorten a wait
 * unless this process was started with the switch.
 */

const HOUR_MS = 3_600_000;

/** How long a timecapsule stays sealed after its open hours end. */
export const CAPSULE_SEAL_MS = 24 * HOUR_MS;

/** A start this far in the past still counts as now. */
export const EVENT_START_SKEW_MS = 2 * 60 * 1000;

/** How far ahead a timecapsule may be set to open. */
export const EVENT_START_AHEAD_MS = 366 * 24 * HOUR_MS;

/** The open hours run from the chosen start. The frames come back a day after that window ends. */
export function capsuleWindow(startMs: number, hours: number): { startsAt: number; endsAt: number; revealAt: number } {
  const startsAt = startMs;
  const endsAt = startsAt + hours * HOUR_MS;
  return { startsAt, endsAt, revealAt: endsAt + CAPSULE_SEAL_MS };
}

export function devClockEnabled(): boolean {
  return process.env.RELAPSE_DEV_CLOCK === "1";
}

export function devClockRequested(header: string | null, enabled = devClockEnabled()): boolean {
  return enabled && header === "1";
}

/** Uniform on [5 minutes, 30 minutes). */
export function personalWaitMs(dev: boolean, random = Math.random()): number {
  if (dev) return 8_000;
  const unit = Math.min(0.999999, Math.max(0, random));
  return (5 + unit * 25) * 60_000;
}

export function personalReadyAt(nowMs: number, dev: boolean, random = Math.random()): Date {
  return new Date(nowMs + personalWaitMs(dev, random));
}

/** How long a shared frame stays on the feed before the file is deleted. */
export const FEED_DAYS = 7;
export const FEED_TTL_MS = FEED_DAYS * 24 * 60 * 60 * 1000;

export function eventTimes(
  nowMs: number,
  hours: number,
  dev: boolean,
  startMs = nowMs,
): { startsAt: Date; endsAt: Date; revealAt: Date } {
  if (dev) {
    const startsAt = new Date(startMs);
    const endsAt = new Date(startMs + 40_000);
    return { startsAt, endsAt, revealAt: new Date(endsAt.getTime() + 20_000) };
  }
  const window = capsuleWindow(startMs, hours);
  return {
    startsAt: new Date(window.startsAt),
    endsAt: new Date(window.endsAt),
    revealAt: new Date(window.revealAt),
  };
}
