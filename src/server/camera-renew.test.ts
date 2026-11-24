import assert from "node:assert/strict";
import test from "node:test";
import { cameraRenewal } from "./camera-renew.ts";

test("an update keeps the camera the cookie already proves", () => {
  assert.equal(cameraRenewal({ cookie: true, headerToken: true }), "keep");
  assert.equal(cameraRenewal({ cookie: true, headerToken: false }), "keep");
});

test("a stored token without its cookie is not a new camera", () => {
  assert.equal(cameraRenewal({ cookie: false, headerToken: true }), "hold");
});

test("a phone with nothing stored can be issued", () => {
  assert.equal(cameraRenewal({ cookie: false, headerToken: false }), "mint");
});
