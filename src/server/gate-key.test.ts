import assert from "node:assert/strict";
import test from "node:test";
import { GATE_GUESS_LIMIT, gateCookie, gateGuessBlocked, guessMayCompare, resolveGateSecret, sameSecret } from "./gate-key.ts";

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

test("a full phone is not checked, and another phone still is", () => {
  assert.equal(guessMayCompare(0), true);
  assert.equal(guessMayCompare(GATE_GUESS_LIMIT - 1), true);
  assert.equal(guessMayCompare(GATE_GUESS_LIMIT), false);
  assert.equal(guessMayCompare(Number.NaN), false);
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
