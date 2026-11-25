import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SHUTTER_BLINK_MS } from "./flash.ts";

test("the shutter blink stays a blink and holds long enough to see", () => {
  assert.equal(SHUTTER_BLINK_MS, 200);
  assert.ok(SHUTTER_BLINK_MS > 90 && SHUTTER_BLINK_MS <= 250);

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.flash \{\s*z-index: 4;\s*background: #fff8ee;\s*animation: flash 200ms linear forwards;\s*\}/,
  );
  const frames = /@keyframes flash \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  assert.match(frames, /0%,\s*40% \{\s*opacity: 1;\s*\}/);
  assert.match(frames, /100% \{\s*opacity: 0;\s*\}/);
  assert.equal(frames.includes("0.9"), false);

  const shoot = readFileSync(new URL("../components/Shoot.tsx", import.meta.url), "utf8");
  assert.match(shoot, /animationDuration: `\$\{SHUTTER_BLINK_MS\}ms`/);
  assert.match(shoot, /setBlink\(\(count\) => count \+ 1\)/);
  assert.match(shoot, /setTimeout\(\(\) => \{\s*setBlink\(\(current\) => \(current === blink \? 0 : current\)\);\s*\}, SHUTTER_BLINK_MS\)/);
  assert.match(shoot, /className="viewfinder"/);
  assert.match(shoot, /className="shutter"/);
  assert.match(shoot, /className="sprockets left"/);
  assert.match(shoot, /aria-label="Shutter"/);
  assert.equal(/setTimeout\(\(\) => setBurst\(false\), 90\)/.test(shoot), false);
  assert.match(shoot, /await wait\(320\)/);
});
