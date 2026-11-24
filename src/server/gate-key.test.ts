import assert from "node:assert/strict";
import test from "node:test";
import { GATE_GUESS_LIMIT, gateCookie, gateGuessBlocked, resolveGateSecret, sameSecret } from "./gate-key.ts";

test("the gate stays shut until a token is configured", () => {
  assert.equal(resolveGateSecret(undefined), null);
  assert.equal(resolveGateSecret(""), null);
  assert.equal(resolveGateSecret("  "), null);
  assert.equal(resolveGateSecret("  kept-on-the-server  "), "kept-on-the-server");
});

test("wrong gate keys slow down after a short run of failures", () => {
  assert.equal(gateGuessBlocked(0), false);
  assert.equal(gateGuessBlocked(GATE_GUESS_LIMIT - 1), false);
  assert.equal(gateGuessBlocked(GATE_GUESS_LIMIT), true);
  assert.equal(gateGuessBlocked(GATE_GUESS_LIMIT + 3), true);
  assert.equal(gateGuessBlocked(Number.NaN), false);
});

test("secret compare stays quiet about length", () => {
  assert.equal(sameSecret("kept-on-the-server", "kept-on-the-server"), true);
  assert.equal(sameSecret("nope", "kept-on-the-server"), false);
  assert.equal(sameSecret("", "kept-on-the-server"), false);
  assert.equal(sameSecret("kept-on-the-server ", "kept-on-the-server"), false);
  assert.equal(gateCookie("a").length, 64);
  assert.notEqual(gateCookie("a"), gateCookie("b"));
  assert.equal(gateCookie("a"), gateCookie("a"));
});
