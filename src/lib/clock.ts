/**
 * Product waits:
 * - personal frames: uniform 5 to 30 minutes, then the shooter develops to see the frame and chooses whether to share it
 * - events: open for the chosen 8–24 hours, then hidden for 24 hours
 *
 * RELAPSE_DEV_CLOCK is a local-only switch for proving that state machine.
 * The published app does not set it. A request header cannot shorten a wait
 * unless this process was started with the switch.
 */
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

export function eventTimes(
  nowMs: number,
  hours: number,
  dev: boolean,
): { endsAt: Date; revealAt: Date } {
  if (dev) {
    const endsAt = new Date(nowMs + 40_000);
    return { endsAt, revealAt: new Date(endsAt.getTime() + 20_000) };
  }
  const endsAt = new Date(nowMs + hours * 3_600_000);
  return { endsAt, revealAt: new Date(endsAt.getTime() + 24 * 3_600_000) };
}
