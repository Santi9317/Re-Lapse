import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_GATE_KEY, gateCookie, resolveGateSecret, sameSecret } from "./gate-key.ts";

test("a hosted database does not fall back to the local gate key", () => {
  assert.equal(resolveGateSecret(undefined, "postgres://lab/relapse"), null);
  assert.equal(resolveGateSecret("  ", "postgres://lab/relapse"), null);
  assert.equal(resolveGateSecret(undefined, ""), LOCAL_GATE_KEY);
  assert.equal(resolveGateSecret(undefined, undefined), LOCAL_GATE_KEY);
  assert.equal(resolveGateSecret("  kept-on-the-server  ", ""), "kept-on-the-server");
  assert.equal(resolveGateSecret("kept-on-the-server", "postgres://lab/relapse"), "kept-on-the-server");
});

test("secret compare stays quiet about length", () => {
  assert.equal(sameSecret(LOCAL_GATE_KEY, LOCAL_GATE_KEY), true);
  assert.equal(sameSecret("nope", LOCAL_GATE_KEY), false);
  assert.equal(sameSecret("", LOCAL_GATE_KEY), false);
  assert.equal(sameSecret(`${LOCAL_GATE_KEY} `, LOCAL_GATE_KEY), false);
  assert.equal(gateCookie("a").length, 64);
  assert.notEqual(gateCookie("a"), gateCookie("b"));
  assert.equal(gateCookie("a"), gateCookie("a"));
});
