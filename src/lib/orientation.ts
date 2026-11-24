/**
 * Portrait lock for the home-screen camera.
 *
 * The installed shortcut reads `orientation: portrait` from the manifest.
 * That is the lock iOS and Android honor for a standalone app. The Screen
 * Orientation API is the same lock where a browser allows it. A normal
 * Safari tab rejects it, and that rejection is expected.
 *
 * When the viewport is still landscape, `hold-cw` / `hold-ccw` turn the
 * portrait layout so it fills the screen the way a locked phone would.
 * The turn is on the document, not on the video. The lens keeps its
 * scale / scaleX mirror, because a 3D rotate on the video blacks out
 * iOS Safari. The saved frame is left as the camera drew it: that frame
 * is already upright in the portrait layout, and the same turn shows
 * the print. Pinch distance is measured in viewport coordinates, which
 * a turn does not change.
 */

export const PORTRAIT_LOCK = "portrait" as const;

/** A landscape viewport shorter than this is a phone on its side, not a desk. */
export const PHONE_LANDSCAPE_MAX_HEIGHT = 520;

export type PortraitHold = "hold-cw" | "hold-ccw";

export type OrientationHost = {
  orientation?: {
    /** Present on ScreenOrientation, so this host stays assignable to Screen. */
    angle?: number;
    /** Missing from the DOM lib this repo typechecks against. Browsers still ship it. */
    lock?: (orientation: string) => Promise<unknown>;
  };
};

/** Ask the browser to keep portrait. False means the CSS hold has to do it. */
export function lockPortrait(screen: OrientationHost): Promise<boolean> {
  const orientation = screen.orientation;
  const lock = orientation?.lock;
  if (!orientation || typeof lock !== "function") return Promise.resolve(false);
  try {
    return Promise.resolve(lock.call(orientation, PORTRAIT_LOCK)).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/** Legacy `window.orientation` agreed across browsers when `screen.orientation.angle` did not. */
export function normalizeAngle(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360;
}

export function orientationAngle(legacy: number | null | undefined, screenAngle: number | null | undefined): number | null {
  if (typeof legacy === "number" && Number.isFinite(legacy)) return normalizeAngle(legacy);
  if (typeof screenAngle === "number" && Number.isFinite(screenAngle)) return normalizeAngle(screenAngle);
  return null;
}

/**
 * Which way to turn a landscape viewport back into a portrait layout.
 * 90 is counter-clockwise from the phone's natural portrait. 270 is the
 * other landscape. A desk (landscape, angle 0, not phone-sized) is left alone.
 */
export function portraitHold(angle: number | null, landscape: boolean, phoneSized: boolean): PortraitHold | null {
  if (!landscape) return null;
  if (angle === 90) return "hold-ccw";
  if (angle === 270) return "hold-cw";
  if (phoneSized && (angle == null || angle === 0 || angle === 180)) return "hold-ccw";
  return null;
}

export function syncPortraitHold(root: { classList: { toggle(name: string, force: boolean): void } }, hold: PortraitHold | null) {
  root.classList.toggle("hold-cw", hold === "hold-cw");
  root.classList.toggle("hold-ccw", hold === "hold-ccw");
}
