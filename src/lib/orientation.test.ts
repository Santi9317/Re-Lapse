import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pinchDistance } from "./zoom.ts";
import {
  PORTRAIT_LOCK,
  lockPortrait,
  orientationAngle,
  portraitHold,
  syncPortraitHold,
} from "./orientation.ts";

test("the manifest keeps the installed shortcut in portrait", () => {
  for (const file of ["../../public/manifest.webmanifest", "../../public/gate.webmanifest"]) {
    const manifest = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")) as {
      orientation?: string;
      display?: string;
    };
    assert.equal(manifest.orientation, PORTRAIT_LOCK);
    assert.equal(manifest.display, "standalone");
  }
});

test("the stylesheet turns the document and leaves the lens alone", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /html\.hold-ccw body/);
  assert.match(css, /rotate\(-90deg\)/);
  assert.match(css, /html\.hold-cw body/);
  assert.match(css, /rotate\(90deg\)/);
  const lens = css.slice(css.indexOf(".lens {"), css.indexOf(".lens.mirror"));
  assert.doesNotMatch(lens, /rotate\(/);
  assert.match(css, /\.viewfinder \{[^}]*touch-action:\s*none/);
});

test("each landscape points the portrait layout back at the top of the phone", () => {
  assert.equal(portraitHold(90, true, true), "hold-ccw");
  assert.equal(portraitHold(270, true, true), "hold-cw");
  assert.equal(portraitHold(orientationAngle(-90, 90), true, true), "hold-cw");
  assert.equal(portraitHold(orientationAngle(90, 270), true, false), "hold-ccw");
  assert.equal(portraitHold(0, true, false), null);
  assert.equal(portraitHold(0, true, true), "hold-ccw");
  assert.equal(portraitHold(90, false, true), null);
  assert.equal(portraitHold(180, true, false), null);
  assert.equal(portraitHold(null, true, false), null);
});

test("the hold class switches with the phone and clears when it is portrait", () => {
  const names = new Set<string>();
  const root = {
    classList: {
      toggle(name: string, force: boolean) {
        if (force) names.add(name);
        else names.delete(name);
      },
    },
  };
  syncPortraitHold(root, "hold-cw");
  assert.deepEqual([...names], ["hold-cw"]);
  syncPortraitHold(root, "hold-ccw");
  assert.deepEqual([...names], ["hold-ccw"]);
  syncPortraitHold(root, null);
  assert.equal(names.size, 0);
});

test("turning the viewport does not change a pinch", () => {
  const a = { clientX: 12, clientY: 40 };
  const b = { clientX: 70, clientY: 16 };
  const spin = (point: { clientX: number; clientY: number }) => ({ clientX: -point.clientY, clientY: point.clientX });
  assert.equal(pinchDistance(spin(a), spin(b)), pinchDistance(a, b));
});

test("a rejected or missing orientation lock leaves the hold in charge", async () => {
  assert.equal(await lockPortrait({}), false);
  assert.equal(
    await lockPortrait({
      orientation: {
        lock: () => Promise.reject(new Error("NotSupportedError")),
      },
    }),
    false,
  );
  assert.equal(
    await lockPortrait({
      orientation: {
        lock() {
          throw new Error("no gesture");
        },
      },
    }),
    false,
  );
});

test("a granted lock asks for portrait and nothing else", async () => {
  let requested = "";
  const ok = await lockPortrait({
    orientation: {
      lock(orientation: string) {
        requested = orientation;
        return Promise.resolve();
      },
    },
  });
  assert.equal(ok, true);
  assert.equal(requested, "portrait");
});
