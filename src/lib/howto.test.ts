import assert from "node:assert/strict";
import test from "node:test";
import { HOW_TO } from "./howto.ts";

test("how to is a user recap, without the builder's notes", () => {
  const text = HOW_TO.map((section) => `${section.title} ${section.body.join(" ")}`).join("\n");
  const lower = text.toLowerCase();
  assert.equal(/iphone|safari|android|deploy/.test(lower), false);
  assert.equal(/\blab\b/.test(lower), false);
  assert.match(lower, /round button/);
  assert.match(lower, /develop/);
  assert.match(lower, /albums/);
  assert.match(lower, /emoji/);
  assert.match(lower, /pinch/);
  assert.match(lower, /double-tap the viewfinder/);
  assert.match(lower, /mirror/);
  assert.match(lower, /saved photo/);
  assert.match(lower, /three emojis/);
  assert.match(lower, /version/);
  assert.match(lower, /inspiration/);
});
