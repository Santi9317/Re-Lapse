import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cameraWake,
  capturePlan,
  labeledDeviceIds,
  lensCookieValue,
  parseStoredCamera,
  recordFromLensCookie,
  permissionFromSignals,
  readCameraRecord,
  savedDeviceId,
  shouldRetryCamera,
  streamHasLiveVideo,
  writeCameraRecord,
  type StoredCamera,
} from "./camera.ts";

const ORIGIN = "https://relapse.example";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

test("a labeled camera is still granted when the Permissions API only says prompt", () => {
  assert.equal(
    permissionFromSignals({
      permissionState: "prompt",
      videoInputs: [{ deviceId: "rear", label: "Back Camera" }],
    }),
    "granted",
  );
  assert.equal(
    permissionFromSignals({
      permissionState: null,
      videoInputs: [{ deviceId: "rear", label: "Back Camera" }],
    }),
    "granted",
  );
});

test("empty labels after a relaunch are not a grant", () => {
  assert.equal(
    permissionFromSignals({
      permissionState: "prompt",
      videoInputs: [{ deviceId: "ephemeral", label: "" }],
    }),
    "prompt",
  );
  assert.equal(
    permissionFromSignals({
      permissionState: null,
      videoInputs: [{ deviceId: "ephemeral", label: "   " }],
    }),
    "prompt",
  );
  assert.deepEqual(labeledDeviceIds([{ deviceId: "ephemeral", label: "" }]), []);
});

test("a denied camera stays denied even when a label is still listed", () => {
  assert.equal(
    permissionFromSignals({
      permissionState: "denied",
      videoInputs: [{ deviceId: "rear", label: "Back Camera" }],
    }),
    "denied",
  );
});

test("a grant kept in site data does not skip the prompt iOS forgot", () => {
  const stored = parseStoredCamera(
    JSON.stringify({ origin: ORIGIN, granted: true, environment: "rear-from-last-launch" }),
  );
  assert.equal(stored.granted, true);
  const saved = savedDeviceId(stored, "environment", ORIGIN);
  assert.equal(saved, "rear-from-last-launch");
  const permission = permissionFromSignals({
    permissionState: "prompt",
    videoInputs: [{ deviceId: "ephemeral", label: "" }],
  });
  const plan = capturePlan({
    permission,
    facing: "environment",
    savedDeviceId: saved,
    visibleDeviceIds: labeledDeviceIds([{ deviceId: "ephemeral", label: "" }]),
  });
  assert.ok(plan);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].deviceId, undefined);
  assert.deepEqual(plan[0].facingMode, { ideal: "environment" });
});

test("a stored grant does not open a camera the system has denied", () => {
  const stored = parseStoredCamera(JSON.stringify({ origin: ORIGIN, granted: true, environment: "rear" }));
  const plan = capturePlan({
    permission: permissionFromSignals({ permissionState: "denied", videoInputs: [] }),
    facing: "environment",
    savedDeviceId: savedDeviceId(stored, "environment", ORIGIN),
    visibleDeviceIds: ["rear"],
  });
  assert.equal(plan, null);
});

test("an already granted camera reopens on the saved device", () => {
  const inputs = [{ deviceId: "rear", label: "Back Camera" }];
  const plan = capturePlan({
    permission: permissionFromSignals({ permissionState: "granted", videoInputs: inputs }),
    facing: "environment",
    savedDeviceId: "rear",
    visibleDeviceIds: labeledDeviceIds(inputs),
  });
  assert.ok(plan);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].deviceId, { exact: "rear" });
  assert.deepEqual(plan[1].facingMode, { ideal: "environment" });
});

test("a granted camera with a missing saved id asks by facing once", () => {
  const plan = capturePlan({
    permission: "granted",
    facing: "user",
    savedDeviceId: "gone",
    visibleDeviceIds: ["rear"],
  });
  assert.ok(plan);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].facingMode, { ideal: "user" });
  assert.equal(plan[0].deviceId, undefined);
});

test("a device id stored for another origin is ignored", () => {
  const stored = parseStoredCamera(
    JSON.stringify({ origin: "https://other.example", granted: true, environment: "rear" }),
  );
  assert.equal(savedDeviceId(stored, "environment", ORIGIN), null);
  assert.equal(savedDeviceId(stored, "environment", "https://other.example"), "rear");
});

test("an older record without an origin still names this install's camera", () => {
  const stored = parseStoredCamera(JSON.stringify({ environment: "rear", user: "front" }));
  assert.equal(stored.granted, false);
  assert.equal(stored.origin, null);
  assert.equal(savedDeviceId(stored, "environment", ORIGIN), "rear");
  assert.equal(savedDeviceId(stored, "user", ORIGIN), "front");
});

test("the grant record round-trips for this origin and keeps both cameras", () => {
  const storage = memoryStorage();
  const record: StoredCamera = {
    origin: ORIGIN,
    granted: true,
    devices: { environment: "rear", user: "front" },
  };
  writeCameraRecord(storage, record);
  const stored = readCameraRecord(storage);
  assert.deepEqual(stored, record);
  assert.equal(savedDeviceId(stored, "user", ORIGIN), "front");
});

test("a private-mode storage failure is ignored", () => {
  writeCameraRecord(
    {
      setItem() {
        throw new Error("private");
      },
    },
    { origin: ORIGIN, granted: true, devices: { environment: "rear" } },
  );
  assert.deepEqual(readCameraRecord({ getItem() { throw new Error("private"); } }), {
    origin: null,
    granted: false,
    devices: {},
  });
});

test("a refusal is not retried, and a missing saved camera is", () => {
  assert.equal(shouldRetryCamera("NotAllowedError"), false);
  assert.equal(shouldRetryCamera("SecurityError"), false);
  assert.equal(shouldRetryCamera("NotReadableError"), false);
  assert.equal(shouldRetryCamera("OverconstrainedError"), true);
  assert.equal(shouldRetryCamera("NotFoundError"), true);
  assert.equal(shouldRetryCamera("ConstraintNotSatisfiedError"), true);
});

test("leaving the home screen keeps a live track and does not ask again", () => {
  for (const event of ["visibility-hidden", "pagehide", "blur", "leave-shoot"] as const) {
    assert.equal(cameraWake(event, true), "keep");
    assert.equal(cameraWake(event, false), "keep");
  }
  assert.equal(cameraWake("visibility-visible", true), "reuse");
  assert.equal(cameraWake("pageshow", true), "reuse");
  assert.equal(cameraWake("show-shoot", true), "reuse");
  assert.equal(cameraWake("visibility-visible", false), "request");
  assert.equal(cameraWake("pageshow", false), "request");
  assert.equal(cameraWake("show-shoot", false), "request");
});

test("a live video track is the only reason to skip a new camera request", () => {
  assert.equal(streamHasLiveVideo(null), false);
  assert.equal(streamHasLiveVideo({ getVideoTracks: () => [] }), false);
  assert.equal(streamHasLiveVideo({ getVideoTracks: () => [{ readyState: "ended" }] }), false);
  assert.equal(streamHasLiveVideo({ getVideoTracks: () => [{ readyState: "live" }] }), true);
  assert.equal(
    streamHasLiveVideo({
      getVideoTracks() {
        throw new Error("gone");
      },
    }),
    false,
  );
});

test("the lens cookie round-trips the saved camera", () => {
  const stored: StoredCamera = { origin: ORIGIN, granted: true, devices: { environment: "rear" } };
  const encoded = encodeURIComponent(lensCookieValue(stored));
  assert.deepEqual(recordFromLensCookie(encoded), stored);
  assert.deepEqual(recordFromLensCookie(null), { origin: null, granted: false, devices: {} });
});

test("hide and blur do not stop the camera", () => {
  const source = readFileSync(new URL("../components/Shoot.tsx", import.meta.url), "utf8");
  assert.match(source, /document\.addEventListener\("visibilitychange"/);
  assert.match(source, /window\.addEventListener\("pageshow"/);
  assert.equal(/addEventListener\(\s*["']blur["']/.test(source), false);
  assert.equal(/addEventListener\(\s*["']pagehide["']/.test(source), false);
  assert.equal(cameraWake("visibility-hidden", true), "keep");
  assert.equal(cameraWake("pagehide", true), "keep");
  assert.equal(cameraWake("blur", true), "keep");
});

test("corrupt site data does not become a grant", () => {
  assert.deepEqual(parseStoredCamera("not-json"), { origin: null, granted: false, devices: {} });
  assert.deepEqual(parseStoredCamera(JSON.stringify({ granted: "true", environment: "" })), {
    origin: null,
    granted: false,
    devices: {},
  });
});
