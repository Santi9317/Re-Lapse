import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the live window is the 4 by 5 cover the shutter saves", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const shoot = readFileSync(new URL("../components/Shoot.tsx", import.meta.url), "utf8");
  const filter = readFileSync(new URL("./filter.ts", import.meta.url), "utf8");
  const print = /const WIDTH = (\d+);\s*const HEIGHT = (\d+);/.exec(filter);
  assert.ok(print);
  const width = Number(print[1]);
  const height = Number(print[2]);
  assert.equal(width * 5, height * 4);

  const paper = css.slice(css.indexOf(".shoot-window {"), css.indexOf(".shoot-print {"));
  assert.match(paper, /background:\s*var\(--paper\)/);
  assert.match(paper, /padding:\s*10px 10px 12px/);
  assert.match(paper, /border-radius:\s*18px/);
  const frame = css.slice(css.indexOf(".shoot-print {"), css.indexOf(".lens {"));
  assert.match(frame, /aspect-ratio:\s*4\s*\/\s*5/);
  assert.match(frame, /overflow:\s*hidden/);
  assert.match(frame, /border-radius:\s*12px/);
  assert.match(frame, /background:\s*#d9cbb8/);

  const feed = css.slice(css.indexOf(".print {"), css.indexOf(".print .frame"));
  assert.match(feed, /background:\s*var\(--paper\)/);
  assert.match(feed, /padding:\s*10px 10px 12px/);
  assert.match(feed, /border-radius:\s*18px/);
  const feedPhoto = css.slice(css.indexOf(".print img {"), css.indexOf(".caption {"));
  assert.match(feedPhoto, /aspect-ratio:\s*4\s*\/\s*5/);
  assert.match(feedPhoto, /object-fit:\s*cover/);
  assert.match(feedPhoto, /border-radius:\s*12px/);

  const lens = css.slice(css.indexOf(".lens {"), css.indexOf(".lens.mirror"));
  assert.match(lens, /object-fit:\s*cover/);
  assert.doesNotMatch(lens, /object-fit:\s*contain/);
  assert.match(css, /\.viewfinder \{[^}]*touch-action:\s*none/);

  assert.match(shoot, /className="shoot-window"/);
  assert.match(shoot, /className="shoot-print"/);
  assert.match(shoot, /className="viewfinder"/);
  assert.match(shoot, /className="shutter"/);
  assert.match(shoot, /aria-label=\{lamp \? "Flash on" : "Flash off"\}/);
  assert.match(shoot, /captureFrame\(/);
  assert.match(shoot, /renderDisposable\(/);
  assert.match(shoot, /renderLatent\(/);
  assert.match(shoot, /wakeRef\.current\("leave-shoot"\)/);
});
