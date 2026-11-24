import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APP_VERSION } from "./release.ts";

test("the menu version is the string package.json ships", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version?: string };
  assert.equal(pkg.version, APP_VERSION);
  assert.match(APP_VERSION, /^\d+\.\d+$/);
});
