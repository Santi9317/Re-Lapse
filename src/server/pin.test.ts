import assert from "node:assert/strict";
import test from "node:test";
import { PIN_RESTORE_LIMIT, normalizePin, pinRestoreOpen, profilePinHash } from "./pin.ts";

test("a profile PIN is six digits", () => {
  assert.equal(normalizePin("048213"), "048213");
  assert.equal(normalizePin("048 213"), "048213");
  assert.equal(normalizePin("048-213"), "048213");
  assert.equal(normalizePin(" 123456 "), "123456");
  assert.equal(normalizePin("12345"), null);
  assert.equal(normalizePin("1234567"), null);
  assert.equal(normalizePin("12ab56"), null);
  assert.equal(normalizePin(123456), null);
  assert.equal(normalizePin(""), null);
});

test("PIN checks share one short run, and a new browser does not reset it", () => {
  assert.equal(pinRestoreOpen(0), true);
  assert.equal(pinRestoreOpen(PIN_RESTORE_LIMIT - 1), true);
  assert.equal(pinRestoreOpen(PIN_RESTORE_LIMIT), false);
  assert.equal(pinRestoreOpen(Number.NaN), false);
});

test("the stored PIN is not the digits", () => {
  const secret = "lab-secret";
  const hash = profilePinHash("048213", secret);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes("048213"), false);
  assert.equal(profilePinHash("048213", secret), hash);
  assert.notEqual(profilePinHash("048214", secret), hash);
  assert.notEqual(profilePinHash("048213", "other-secret"), hash);
});
