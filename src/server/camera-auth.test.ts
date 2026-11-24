import assert from "node:assert/strict";
import test from "node:test";
import { boothFromCookie, cameraAuthFromCookie, shouldRefreshPhoneCookie } from "./camera-auth.ts";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const PROOF = "a".repeat(64);

test("the camera proof is the httpOnly cookie", () => {
  const header = `theme=dark; relapse_auth=${encodeURIComponent(`${TOKEN}.${PROOF}`)}`;
  assert.deepEqual(cameraAuthFromCookie(header), { token: TOKEN, proof: PROOF });
});

test("a document load refreshes the phone cookie and an API call does not", () => {
  assert.equal(shouldRefreshPhoneCookie("GET", "/"), true);
  assert.equal(shouldRefreshPhoneCookie("GET", "/gate"), true);
  assert.equal(shouldRefreshPhoneCookie("POST", "/"), false);
  assert.equal(shouldRefreshPhoneCookie("GET", "/api/camera"), false);
  assert.equal(boothFromCookie(`relapse_booth=${TOKEN}`), TOKEN);
  assert.equal(boothFromCookie("relapse_booth=nope"), null);
});

test("a proof sitting in a header is not the camera", () => {
  assert.equal(cameraAuthFromCookie(null), null);
  assert.equal(cameraAuthFromCookie("x-camera-proof=" + "b".repeat(64)), null);
  assert.equal(cameraAuthFromCookie(`relapse_auth=${TOKEN}.short`), null);
});
