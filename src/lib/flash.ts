export function isIosDevice(
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
  touchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
): boolean {
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return platform === "MacIntel" && touchPoints > 1;
}

export async function setTorch(track: MediaStreamTrack | null, on: boolean): Promise<boolean> {
  if (!track || track.readyState !== "live") return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * How long the finder whites out after the shutter.
 * A blink, held long enough to see that the frame was taken.
 * Keep this equal to the `.flash` duration in globals.css.
 */
export const SHUTTER_BLINK_MS = 200;
