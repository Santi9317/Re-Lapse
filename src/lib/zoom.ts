/**
 * Pinch zoom for the viewfinder.
 * A camera that reports a zoom range, and a current zoom, is zoomed with track
 * constraints. Anything else uses a center crop. The crop scale is the same one
 * painted on the preview, so the JPEG matches the finder. The front-camera mirror
 * is a separate transform and never flips the saved frame.
 */

export type ZoomRange = { min: number; max: number; step: number };

/** Digital crop used only when the track cannot zoom. Past 4× the 4-by-5 print goes soft. */
export const VISUAL_ZOOM: ZoomRange = { min: 1, max: 4, step: 0.01 };

const WHEEL_PINCH = 0.01;

export type ZoomTrack = {
  id?: string;
  readyState?: string;
  getCapabilities?: () => object;
  getSettings?: () => MediaTrackSettings;
  applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
};

export type ZoomState = { zoom: number; optical: boolean };

export type ViewfinderZoom = {
  adopt: (track: ZoomTrack | null) => void;
  setZoom: (next: number) => void;
  pinch: (startZoom: number, startDistance: number, distance: number) => void;
  wheel: (deltaY: number) => void;
  preview: () => number;
  readonly zoom: number;
  readonly optical: boolean;
  readonly range: ZoomRange;
};

export type StillFrame = {
  width: number;
  height: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function defaultStep(span: number): number {
  if (span >= 8) return 0.1;
  if (span >= 2) return 0.05;
  return 0.01;
}

function decimalPlaces(step: number): number {
  const text = step.toString().toLowerCase();
  const exp = text.match(/e-(\d+)/);
  if (exp) return Number(exp[1]);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function readZoomRange(
  zoom: { min?: number; max?: number; step?: number } | null | undefined,
): ZoomRange | null {
  if (!zoom) return null;
  const min = positive(zoom.min);
  const max = positive(zoom.max);
  if (min == null || max == null || !(max > min) || max - min < 0.02) return null;
  let step = positive(zoom.step);
  if (step == null || step >= max - min) step = defaultStep(max - min);
  return { min, max, step };
}

export function readTrackZoomRange(track: ZoomTrack | null | undefined): ZoomRange | null {
  try {
    const caps = track?.getCapabilities?.() as { zoom?: { min?: number; max?: number; step?: number } } | undefined;
    return readZoomRange(caps?.zoom);
  } catch {
    return null;
  }
}

export function readTrackZoom(track: ZoomTrack | null | undefined): number | null {
  try {
    const zoom = track?.getSettings?.().zoom;
    return typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0 ? zoom : null;
  } catch {
    return null;
  }
}

export function snapZoom(value: number, range: ZoomRange): number {
  if (!Number.isFinite(value)) return range.min;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  if (!(range.step > 0)) return clamped;
  const steps = Math.round((clamped - range.min) / range.step);
  const snapped = range.min + steps * range.step;
  const tidy = Number(snapped.toFixed(Math.min(6, decimalPlaces(range.step))));
  return Math.min(range.max, Math.max(range.min, tidy));
}

export function startingZoom(range: ZoomRange, current: number | null): number {
  if (current != null && Number.isFinite(current)) return snapZoom(current, range);
  return snapZoom(1, range);
}

export function zoomFromPinch(startZoom: number, startDistance: number, distance: number, range: ZoomRange): number {
  if (!(startDistance > 0) || !(distance > 0) || !Number.isFinite(startZoom)) return snapZoom(startZoom, range);
  return snapZoom(startZoom * (distance / startDistance), range);
}

export function zoomFromWheel(current: number, deltaY: number, range: ZoomRange): number {
  if (!Number.isFinite(current) || !Number.isFinite(deltaY) || deltaY === 0) return snapZoom(current, range);
  return snapZoom(current * Math.exp(-deltaY * WHEEL_PINCH), range);
}

export function pinchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** 1 while the camera track itself is zoomed, so the preview is not cropped a second time. */
export function previewScale(optical: boolean, zoom: number): number {
  if (optical) return 1;
  if (!Number.isFinite(zoom) || zoom <= 1) return 1;
  return zoom;
}

/**
 * Inline transform for a visual crop. Undefined leaves `.lens.mirror` in charge,
 * which is the unzoomed front preview.
 */
export function lensTransform(mirrored: boolean, scale: number): string | undefined {
  if (!Number.isFinite(scale) || scale <= 1.001) return undefined;
  const factor = String(Math.round(scale * 1000) / 1000);
  return mirrored ? `scaleX(-1) scale(${factor})` : `scale(${factor})`;
}

/** Center crop of the camera frame. Scale 1 keeps the full frame, which an optical zoom already tightened. */
export function captureFrame(videoWidth: number, videoHeight: number, scale: number): StillFrame {
  const width = Number.isFinite(videoWidth) && videoWidth > 0 ? videoWidth : 0;
  const height = Number.isFinite(videoHeight) && videoHeight > 0 ? videoHeight : 0;
  const zoom = Number.isFinite(scale) && scale > 1 ? scale : 1;
  if (width === 0 || height === 0 || zoom === 1) {
    return { width, height, sx: 0, sy: 0, sw: width, sh: height };
  }
  const sw = width / zoom;
  const sh = height / zoom;
  return {
    width: Math.max(1, Math.round(sw)),
    height: Math.max(1, Math.round(sh)),
    sx: (width - sw) / 2,
    sy: (height - sh) / 2,
    sw,
    sh,
  };
}

export function formatZoom(zoom: number): string {
  const hundredths = Math.round(zoom * 100) / 100;
  const tenths = Math.round(zoom * 10) / 10;
  if (Math.abs(hundredths - tenths) < 0.001) return `${tenths.toFixed(1)}×`;
  return `${hundredths.toFixed(2)}×`;
}

export function zoomIsRest(zoom: number): boolean {
  return Math.abs(zoom - 1) < 0.05;
}

export async function applyTrackZoom(track: ZoomTrack, zoom: number, step = 0): Promise<number | null> {
  if (!track.applyConstraints || !Number.isFinite(zoom) || zoom <= 0) return null;
  const advanced = { advanced: [{ zoom }] } as unknown as MediaTrackConstraints;
  const plain = { zoom } as unknown as MediaTrackConstraints;
  try {
    await track.applyConstraints(advanced);
  } catch {
    try {
      await track.applyConstraints(plain);
    } catch {
      return null;
    }
  }
  const actual = readTrackZoom(track);
  if (actual == null) return null;
  const slack = Math.max(0.03, step > 0 ? step * 0.6 : 0);
  if (Math.abs(actual - zoom) > slack) return null;
  return actual;
}

export function createViewfinderZoom(listener: (state: ZoomState) => void): ViewfinderZoom {
  let range: ZoomRange = VISUAL_ZOOM;
  let optical = false;
  let zoom = 1;
  let track: ZoomTrack | null = null;
  let trackId: string | null = null;
  let applied = 1;
  let confirmed = false;
  let pumping = false;
  let generation = 0;
  let publishedZoom = 1;
  let publishedOptical = false;

  function publish() {
    if (publishedZoom === zoom && publishedOptical === optical) return;
    publishedZoom = zoom;
    publishedOptical = optical;
    listener({ zoom, optical });
  }

  function useVisual(next: number) {
    generation += 1;
    track = null;
    trackId = null;
    optical = false;
    confirmed = false;
    range = VISUAL_ZOOM;
    zoom = snapZoom(Math.max(next, VISUAL_ZOOM.min), VISUAL_ZOOM);
    applied = zoom;
    publish();
  }

  function adopt(next: ZoomTrack | null) {
    if (!next || next.readyState === "ended") {
      useVisual(1);
      return;
    }
    const id = typeof next.id === "string" && next.id.length > 0 ? next.id : null;
    if (id && id === trackId) return;
    generation += 1;
    track = next;
    trackId = id;
    confirmed = false;
    const detected = readTrackZoomRange(next);
    const current = readTrackZoom(next);
    if (detected && current != null) {
      optical = true;
      range = detected;
      zoom = startingZoom(detected, current);
      applied = zoom;
    } else {
      optical = false;
      range = VISUAL_ZOOM;
      zoom = 1;
      applied = 1;
    }
    publish();
  }

  function setZoom(next: number) {
    const snapped = snapZoom(next, range);
    if (snapped === zoom) return;
    zoom = snapped;
    publish();
    if (optical) void pump();
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    const gen = generation;
    try {
      while (gen === generation && optical && track) {
        const target = zoom;
        if (Math.abs(target - applied) <= 0.0001) break;
        const actual = await applyTrackZoom(track, target, range.step);
        if (gen !== generation) break;
        if (actual == null) {
          if (confirmed) {
            const current = track ? (readTrackZoom(track) ?? applied) : applied;
            zoom = snapZoom(current, range);
            applied = zoom;
            publish();
          } else {
            useVisual(zoom);
          }
          break;
        }
        confirmed = true;
        applied = actual;
        if (Math.abs(zoom - target) <= 0.0001 && Math.abs(actual - zoom) > 0.0001) {
          zoom = snapZoom(actual, range);
          applied = zoom;
          publish();
        }
      }
    } finally {
      pumping = false;
      if (gen === generation && optical && track && Math.abs(zoom - applied) > 0.0001) void pump();
    }
  }

  return {
    adopt,
    setZoom,
    pinch(startZoom, startDistance, distance) {
      setZoom(zoomFromPinch(startZoom, startDistance, distance, range));
    },
    wheel(deltaY) {
      setZoom(zoomFromWheel(zoom, deltaY, range));
    },
    preview() {
      return previewScale(optical, zoom);
    },
    get zoom() {
      return zoom;
    },
    get optical() {
      return optical;
    },
    get range() {
      return range;
    },
  };
}
