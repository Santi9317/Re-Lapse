import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWarmth,
  disposableProfile,
  exposureEv,
  gradeFlat,
  gradeFrame,
  stampParts,
  toneCurve,
} from "./disposable.ts";

function flat(width: number, height: number, value: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return data;
}

function meanRegion(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
      n += 3;
    }
  }
  return sum / n;
}

test("the tone curve lifts the floor and holds the shoulder", () => {
  assert.equal(toneCurve(0), 0.0784);
  assert.equal(toneCurve(1), 0.949);
  assert.equal(toneCurve(0.502), 0.502);
  let previous = -1;
  for (let i = 0; i <= 20; i++) {
    const value = toneCurve(i / 20);
    assert.ok(value >= previous);
    assert.ok(value <= 1);
    previous = value;
  }
});

test("a dark frame is not pushed further down, and warmth scales with the bath", () => {
  assert.equal(exposureEv(0.1, "default"), 0);
  assert.equal(exposureEv(0.1, "daylight"), 0);
  assert.equal(exposureEv(0.45, "default"), -0.3);
  assert.equal(exposureEv(0.45, "daylight"), -0.15);
  assert.equal(exposureEv(0.05, "night"), 0);
  assert.equal(disposableProfile("default").grain, 35);
  assert.equal(disposableProfile("daylight").grain, 28);
  assert.equal(disposableProfile("daylight").vignette, 8);
  assert.equal(disposableProfile("night").vignette, 10);
  assert.equal(disposableProfile("daylight").warmth, 0.6);
  assert.equal(disposableProfile("night").warmth, 0.5);
  assert.equal(disposableProfile("default").bloom, 0.065);
  assert.equal(disposableProfile("night").halation, 0.07);
  const full = applyWarmth(0.5, 0.5, 0.5, 1);
  const day = applyWarmth(0.5, 0.5, 0.5, disposableProfile("daylight").warmth);
  const night = applyWarmth(0.5, 0.5, 0.5, disposableProfile("night").warmth);
  assert.ok(Math.abs((day[0] - 0.5) / (full[0] - 0.5) - 0.6) < 1e-9);
  assert.ok(Math.abs((night[2] - 0.5) / (full[2] - 0.5) - 0.5) < 1e-9);
  assert.ok(full[0] > full[2]);
});

test("a neutral midtone goes warm, and the three baths do not match", () => {
  const [r, g, b] = gradeFlat(0.5, 0.5, 0.5, "default");
  assert.ok(r > g && g > b);
  const width = 48;
  const height = 48;
  const source = flat(width, height, 150);
  const again = gradeFrame(source, width, height, { chemistry: "default", seed: "same" });
  const twin = gradeFrame(source, width, height, { chemistry: "default", seed: "same" });
  const other = gradeFrame(source, width, height, { chemistry: "default", seed: "other" });
  const day = gradeFrame(source, width, height, { chemistry: "daylight", seed: "same" });
  const night = gradeFrame(source, width, height, { chemistry: "night", seed: "same" });
  assert.deepEqual(again, twin);
  assert.notDeepEqual(again, other);
  assert.notDeepEqual(day, night);
  assert.notDeepEqual(again, day);
  for (let i = 3; i < again.length; i += 4) assert.equal(again[i], 255);
});

test("corners fall off, and daylight falls off less than the default bath", () => {
  const width = 96;
  const height = 96;
  const source = flat(width, height, 170);
  const base = gradeFrame(source, width, height, { chemistry: "default", seed: "vig" });
  const day = gradeFrame(source, width, height, { chemistry: "daylight", seed: "vig" });
  const center = meanRegion(base, width, 40, 40, 56, 56);
  const corner = meanRegion(base, width, 0, 0, 12, 12);
  assert.ok(corner < center - 4);
  const dayGap = meanRegion(day, width, 40, 40, 56, 56) - meanRegion(day, width, 0, 0, 12, 12);
  const baseGap = center - corner;
  assert.ok(dayGap < baseGap);
});

test("the stamp uses the capture clock and only touches the lower edge", () => {
  const when = new Date(2026, 10, 25, 15, 4);
  assert.deepEqual(stampParts(when), { left: "W 11 25 '26", right: "15:04" });
  assert.equal(stampParts(new Date(Number.NaN)), null);
  const width = 180;
  const height = 220;
  const source = flat(width, height, 120);
  const plain = gradeFrame(source, width, height, { chemistry: "default", seed: "stamp" });
  const stamped = gradeFrame(source, width, height, { chemistry: "default", seed: "stamp", date: when });
  assert.equal(plain[(20 * width + 90) * 4], stamped[(20 * width + 90) * 4]);
  let changed = 0;
  for (let y = height - 30; y < height; y++) {
    for (let x = 0; x < 80; x++) {
      const i = (y * width + x) * 4;
      if (plain[i] !== stamped[i] || plain[i + 1] !== stamped[i + 1]) changed += 1;
    }
  }
  assert.ok(changed > 8);
});
