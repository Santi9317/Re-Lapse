/** Shown once while the booth cookie is stored. The next request can continue. */
export const BOOTH_HANDOFF = "Open the camera again.";

export function shouldReplayBooth(status: number, error: unknown): boolean {
  return status === 409 && error === BOOTH_HANDOFF;
}
