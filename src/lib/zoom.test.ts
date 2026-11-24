import assert from "node:assert/strict";
import test from "node:test";
import {
  VISUAL_ZOOM,
  captureFrame,
  createViewfinderZoom,
  formatZoom,
  lensTransform,
  pinchDistance,
  previewScale,
  readZoomRange,
  zoomFromPinch,
  zoomFromWheel,
  zoomIsRest,
  type ZoomTrack,
} from "./zoom.ts";

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeTrack(options: {
  id: string;
  min?: number;
  max?: number;
  step?: number;
  zoom?: number | null;
  apply?: (zoom: number) => Promise<void> | void;
}): ZoomTrack & { applied: () => number | null } {
  let zoom = options.zoom === undefined ? 1 : options.zoom;
  return {
    id: options.id,
    readyState: "live",
    getCapabilities() {
      if (options.min == null || options.max == null) return {};
      return { zoom: { min: options.min, max: options.max, step: options.step } };
    },
    getSettings() {
      return zoom == null ? {} : { zoom };
    },
    async applyConstraints(constraints: MediaTrackConstraints) {
      const advanced = constraints.advanced?.[0] as { zoom?: number } | undefined;
      const next = advanced?.zoom ?? (constraints as { zoom?: number }).zoom;
      if (typeof next !== "number") throw new Error("missing zoom");
      if (options.apply) await options.apply(next);
      zoom = next;
    },
    applied() {
      return zoom;
    },
  };
}

test("a real zoom range is kept, including wider than 1×", () => {
  assert.deepEqual(readZoomRange({ min: 0.5, max: 8, step: 0.1 }), { min: 0.5, max: 8, step: 0.1 });
  assert.equal(readZoomRange(undefined), null);
  assert.equal(readZoomRange({ min: 1, max: 1 }), null);
  assert.equal(readZoomRange({ min: 2, max: 1 }), null);
  assert.equal(readZoomRange({ min: 0, max: 4 }), null);
});

test("pinch in and pinch out stay inside the camera range", () => {
  const range = { min: 0.5, max: 3, step: 0.1 };
  assert.equal(zoomFromPinch(1, 100, 250, range), 2.5);
  assert.equal(zoomFromPinch(1, 100, 40, range), 0.5);
  assert.equal(zoomFromPinch(1, 100, 900, range), 3);
  assert.equal(zoomFromPinch(2, 200, 100, range), 1);
  assert.equal(pinchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 }), 5);
});

test("a trackpad pinch uses the same range", () => {
  const range = { min: 1, max: 4, step: 0.01 };
  const inn = zoomFromWheel(1, -100, range);
  assert.ok(inn > 1.5 && inn < 4);
  const back = zoomFromWheel(inn, 100, range);
  assert.ok(Math.abs(back - 1) < 0.05);
  assert.equal(zoomFromWheel(4, -400, range), 4);
  assert.equal(zoomFromWheel(1, 400, range), 1);
});

test("optical zoom is not also a visual crop", () => {
  assert.equal(previewScale(true, 3), 1);
  assert.equal(previewScale(false, 3), 3);
  assert.equal(previewScale(false, 1), 1);
  assert.equal(previewScale(false, 0.6), 1);
});

test("the saved frame matches the preview scale and stays centered", () => {
  const full = captureFrame(1600, 1200, previewScale(true, 2));
  assert.deepEqual(full, { width: 1600, height: 1200, sx: 0, sy: 0, sw: 1600, sh: 1200 });

  const cropped = captureFrame(1600, 1200, previewScale(false, 2));
  assert.equal(cropped.sw, 800);
  assert.equal(cropped.sh, 600);
  assert.equal(cropped.sx, 400);
  assert.equal(cropped.sy, 300);
  assert.ok(Math.abs(cropped.sx + cropped.sw / 2 - 800) < 0.001);
  assert.ok(Math.abs(cropped.sy + cropped.sh / 2 - 600) < 0.001);
});

test("the front preview keeps its mirror and the crop is not flipped", () => {
  assert.equal(lensTransform(true, 1), undefined);
  assert.equal(lensTransform(false, 1), undefined);
  assert.equal(lensTransform(false, 2), "scale(2)");
  assert.equal(lensTransform(true, 2), "scaleX(-1) scale(2)");
  const front = captureFrame(1600, 1200, 2);
  assert.equal(front.sx, (1600 - front.sw) / 2);
  assert.ok(front.sw > 0);
});

test("a camera with zoom uses the track and does not crop the preview", async () => {
  const rear = fakeTrack({ id: "rear", min: 1, max: 8, step: 0.1 });
  const seen: Array<{ zoom: number; optical: boolean }> = [];
  const view = createViewfinderZoom((state) => seen.push(state));
  view.adopt(rear);
  assert.equal(view.optical, true);
  assert.equal(view.range.max, 8);
  view.pinch(1, 100, 200);
  await settle();
  assert.equal(view.zoom, 2);
  assert.equal(rear.applied(), 2);
  assert.equal(view.preview(), 1);
  assert.equal(captureFrame(1600, 1200, view.preview()).sw, 1600);
  assert.equal(seen.at(-1)?.optical, true);
});

test("a fast pinch lands on the latest optical zoom", async () => {
  const applied: number[] = [];
  let zoom = 1;
  const rear = fakeTrack({
    id: "rear",
    min: 1,
    max: 8,
    step: 0.1,
    apply: async (next) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      zoom = next;
      applied.push(next);
    },
  });
  const view = createViewfinderZoom(() => undefined);
  view.adopt(rear);
  view.setZoom(2);
  view.setZoom(3);
  view.setZoom(4);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(zoom, 4);
  assert.equal(view.zoom, 4);
  assert.equal(applied.at(-1), 4);
  assert.equal(view.preview(), 1);
});

test("a camera that cannot zoom crops, and the capture uses that crop", async () => {
  const front = fakeTrack({ id: "front" });
  const view = createViewfinderZoom(() => undefined);
  view.adopt(front);
  assert.equal(view.optical, false);
  assert.equal(view.range.max, VISUAL_ZOOM.max);
  view.pinch(1, 100, 250);
  await settle();
  assert.equal(view.zoom, 2.5);
  assert.equal(view.preview(), 2.5);
  const frame = captureFrame(1000, 800, view.preview());
  assert.equal(frame.sw, 400);
  assert.equal(frame.sh, 320);
  assert.equal(lensTransform(true, view.preview()), "scaleX(-1) scale(2.5)");
  view.pinch(view.zoom, 250, 2000);
  assert.equal(view.zoom, VISUAL_ZOOM.max);
});

test("a track that ignores zoom falls back to the same crop the preview will show", async () => {
  const rear = fakeTrack({
    id: "rear",
    min: 1,
    max: 6,
    step: 0.1,
    apply: () => {
      throw new Error("unsupported");
    },
  });
  const view = createViewfinderZoom(() => undefined);
  view.adopt(rear);
  assert.equal(view.optical, true);
  view.setZoom(2);
  await settle();
  assert.equal(view.optical, false);
  assert.equal(view.zoom, 2);
  assert.equal(view.preview(), 2);
  assert.equal(rear.applied(), 1);
});

test("a later optical rejection keeps the last zoom the camera actually held", async () => {
  let fail = false;
  let zoom = 1;
  const rear = fakeTrack({
    id: "rear",
    min: 1,
    max: 6,
    step: 0.1,
    apply: (next) => {
      if (fail) throw new Error("busy");
      zoom = next;
    },
  });
  const view = createViewfinderZoom(() => undefined);
  view.adopt(rear);
  view.setZoom(2);
  await settle();
  fail = true;
  view.setZoom(3);
  await settle();
  assert.equal(view.optical, true);
  assert.equal(view.zoom, 2);
  assert.equal(zoom, 2);
  assert.equal(view.preview(), 1);
});

test("rear and front each keep their own range", async () => {
  const rear = fakeTrack({ id: "rear", min: 0.5, max: 8, step: 0.1 });
  const front = fakeTrack({ id: "front", min: 1, max: 2, step: 0.1 });
  const view = createViewfinderZoom(() => undefined);
  view.adopt(rear);
  view.setZoom(3);
  await settle();
  assert.equal(rear.applied(), 3);
  view.adopt(front);
  assert.equal(view.zoom, 1);
  assert.equal(view.range.max, 2);
  assert.equal(view.optical, true);
  view.setZoom(6);
  await settle();
  assert.equal(view.zoom, 2);
  assert.equal(front.applied(), 2);
  view.adopt(front);
  assert.equal(view.zoom, 2);
});

test("dropping the camera returns to an unzoomed crop", () => {
  const rear = fakeTrack({ id: "rear", min: 1, max: 4, step: 0.1 });
  const view = createViewfinderZoom(() => undefined);
  view.adopt(rear);
  view.setZoom(2);
  view.adopt(null);
  assert.equal(view.optical, false);
  assert.equal(view.zoom, 1);
  assert.equal(view.preview(), 1);
});

test("the readout speaks one decimal until the hundredths matter", () => {
  assert.equal(formatZoom(1), "1.0×");
  assert.equal(formatZoom(2), "2.0×");
  assert.equal(formatZoom(0.5), "0.5×");
  assert.equal(formatZoom(1.25), "1.25×");
  assert.equal(zoomIsRest(1), true);
  assert.equal(zoomIsRest(1.2), false);
  assert.equal(zoomIsRest(0.5), false);
});
