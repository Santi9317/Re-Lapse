const CAMERA_KEY = "relapse.camera";

export type Facing = "environment" | "user";

export type CameraPermission = "granted" | "denied" | "prompt";

export type VideoInput = { deviceId: string; label: string };

export type StoredCamera = {
  origin: string | null;
  granted: boolean;
  devices: Partial<Record<Facing, string>>;
};

type Held = { facing: Facing; stream: MediaStream };

const EMPTY_RECORD: StoredCamera = { origin: null, granted: false, devices: {} };

let held: Held | null = null;
let opening: { facing: Facing; promise: Promise<MediaStream | null> } | null = null;
let ticket = 0;

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readOrigin(): string {
  try {
    if (typeof location === "undefined") return "";
    return location.origin;
  } catch {
    return "";
  }
}

function deviceIdOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseStoredCamera(raw: string | null): StoredCamera {
  if (!raw) return EMPTY_RECORD;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_RECORD;
    const record = parsed as Record<string, unknown>;
    const environment = deviceIdOf(record.environment);
    const user = deviceIdOf(record.user);
    return {
      origin: typeof record.origin === "string" && record.origin.length > 0 ? record.origin : null,
      granted: record.granted === true,
      devices: {
        ...(environment ? { environment } : {}),
        ...(user ? { user } : {}),
      },
    };
  } catch {
    return EMPTY_RECORD;
  }
}

export function readCameraRecord(storage: Pick<Storage, "getItem"> | null): StoredCamera {
  if (!storage) return EMPTY_RECORD;
  try {
    return parseStoredCamera(storage.getItem(CAMERA_KEY));
  } catch {
    return EMPTY_RECORD;
  }
}

export function writeCameraRecord(storage: Pick<Storage, "setItem"> | null, record: StoredCamera) {
  if (!storage) return;
  try {
    const body: Record<string, string | boolean | null> = {
      origin: record.origin,
      granted: record.granted,
    };
    if (record.devices.environment) body.environment = record.devices.environment;
    if (record.devices.user) body.user = record.devices.user;
    storage.setItem(CAMERA_KEY, JSON.stringify(body));
  } catch {
    /* private mode */
  }
}

export function savedDeviceId(stored: StoredCamera, facing: Facing, origin: string): string | null {
  if (stored.origin && origin && stored.origin !== origin) return null;
  return stored.devices[facing] ?? null;
}

export function savedCameraId(facing: Facing): string | null {
  return savedDeviceId(readCameraRecord(browserStorage()), facing, readOrigin());
}

function rememberGrant(facing: Facing, deviceId: string | undefined) {
  const storage = browserStorage();
  const previous = readCameraRecord(storage);
  const id = deviceId && deviceId.length > 0 ? deviceId : previous.devices[facing];
  writeCameraRecord(storage, {
    origin: readOrigin() || previous.origin,
    granted: true,
    devices: id ? { ...previous.devices, [facing]: id } : previous.devices,
  });
}

function forgetGrant() {
  const storage = browserStorage();
  const current = readCameraRecord(storage);
  if (!current.granted) return;
  writeCameraRecord(storage, { ...current, granted: false });
}

/**
 * A labeled camera means this origin still holds the grant. Site data from the
 * last launch does not. iOS Home Screen apps drop the grant when the process
 * dies (a full swipe away), and the next getUserMedia prompts. Leaving for the
 * Home Screen without swiping the shortcut away must not stop the live track:
 * that stop is what made the prompt fire on the way back. Safari's per-site
 * Allow does not apply to the shortcut (WebKit bug 327237).
 */
export function permissionFromSignals(input: {
  permissionState: CameraPermission | null;
  videoInputs: VideoInput[];
}): CameraPermission {
  if (input.permissionState === "denied") return "denied";
  if (input.permissionState === "granted") return "granted";
  if (input.videoInputs.some((device) => device.label.trim().length > 0)) return "granted";
  return "prompt";
}

export function labeledDeviceIds(inputs: VideoInput[]): string[] {
  return inputs
    .filter((device) => device.label.trim().length > 0 && device.deviceId.length > 0)
    .map((device) => device.deviceId);
}

export function capturePlan(input: {
  permission: CameraPermission;
  facing: Facing;
  savedDeviceId: string | null;
  visibleDeviceIds: string[];
}): MediaTrackConstraints[] | null {
  if (input.permission === "denied") return null;
  const byFacing: MediaTrackConstraints = {
    facingMode: { ideal: input.facing },
    width: { ideal: 1600 },
    height: { ideal: 1200 },
  };
  if (input.permission !== "granted") return [byFacing];
  const saved = input.savedDeviceId;
  if (saved && input.visibleDeviceIds.includes(saved)) {
    return [{ deviceId: { exact: saved }, width: { ideal: 1600 }, height: { ideal: 1200 } }, byFacing];
  }
  return [byFacing];
}

export function shouldRetryCamera(errorName: string): boolean {
  return errorName === "OverconstrainedError" || errorName === "NotFoundError" || errorName === "ConstraintNotSatisfiedError";
}

function failureName(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return error.name;
  if (error instanceof Error) return error.name;
  return "";
}

export type CameraWake =
  | "visibility-hidden"
  | "pagehide"
  | "blur"
  | "leave-shoot"
  | "visibility-visible"
  | "pageshow"
  | "show-shoot";

/**
 * A live track stays up across the Home Screen, a blur, and leaving Shoot.
 * getUserMedia runs only when that track is already gone. A swipe-away ends
 * the process, so the next launch has nothing left to reuse.
 */
export function cameraWake(event: CameraWake, hasLiveTrack: boolean): "keep" | "reuse" | "request" {
  if (event === "visibility-hidden" || event === "pagehide" || event === "blur" || event === "leave-shoot") {
    return "keep";
  }
  return hasLiveTrack ? "reuse" : "request";
}

export function streamHasLiveVideo(
  stream: { getVideoTracks(): Array<{ readyState?: string }> } | null | undefined,
): boolean {
  if (!stream) return false;
  try {
    return stream.getVideoTracks().some((track) => track.readyState === "live");
  } catch {
    return false;
  }
}

function liveStream(facing: Facing): MediaStream | null {
  if (!held || held.facing !== facing) return null;
  if (!streamHasLiveVideo(held.stream)) {
    held = null;
    return null;
  }
  return held.stream;
}

/** The live stream for this facing, or null. Does not call getUserMedia. */
export function peekCamera(facing: Facing): MediaStream | null {
  return liveStream(facing);
}

function stopHeld() {
  held?.stream.getTracks().forEach((track) => track.stop());
  held = null;
}

/** Stops the held track. Shoot must not call this on hide, blur, pagehide, or a tab change. */
export function releaseCamera() {
  stopHeld();
}

async function queryCameraPermission(): Promise<CameraPermission | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: "camera" });
    if (status.state === "granted" || status.state === "denied" || status.state === "prompt") return status.state;
    return null;
  } catch {
    return null;
  }
}

async function listVideoInputs(): Promise<VideoInput[]> {
  try {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "videoinput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label }));
  } catch {
    return [];
  }
}

async function request(facing: Facing, mine: number): Promise<MediaStream | null> {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!media?.getUserMedia) return null;

  const videoInputs = await listVideoInputs();
  if (mine !== ticket) return liveStream(facing);
  const permission = permissionFromSignals({
    permissionState: await queryCameraPermission(),
    videoInputs,
  });
  if (mine !== ticket) return liveStream(facing);

  const stored = readCameraRecord(browserStorage());
  const plan = capturePlan({
    permission,
    facing,
    savedDeviceId: savedDeviceId(stored, facing, readOrigin()),
    visibleDeviceIds: labeledDeviceIds(videoInputs),
  });
  if (!plan) {
    if (permission === "denied") forgetGrant();
    return null;
  }

  // Only getUserMedia in the app. openCamera skips this while peekCamera
  // still has a live video track for the same facing. Stopping here is for a
  // different camera (a flip), or a track that has already ended.
  stopHeld();
  for (let index = 0; index < plan.length; index += 1) {
    if (mine !== ticket) return liveStream(facing);
    try {
      const stream = await media.getUserMedia({ audio: false, video: plan[index] });
      const track = stream.getVideoTracks()[0];
      const deviceId = track?.getSettings?.().deviceId;
      rememberGrant(facing, deviceId);
      if (mine !== ticket) {
        stream.getTracks().forEach((trackToStop) => trackToStop.stop());
        return liveStream(facing);
      }
      held = { facing, stream };
      return stream;
    } catch (error) {
      const name = failureName(error);
      if (index < plan.length - 1 && shouldRetryCamera(name)) continue;
      if (name === "NotAllowedError") forgetGrant();
      return null;
    }
  }
  return null;
}

export function openCamera(facing: Facing): Promise<MediaStream | null> {
  const existing = liveStream(facing);
  if (existing) return Promise.resolve(existing);
  if (opening?.facing === facing) return opening.promise;
  const mine = ++ticket;
  const promise = request(facing, mine).finally(() => {
    if (opening?.promise === promise) opening = null;
  });
  opening = { facing, promise };
  return promise;
}

export function isHardwareShutter(event: { code?: string; key?: string; keyCode?: number }): boolean {
  const code = event.code ?? "";
  const key = event.key ?? "";
  const keyCode = event.keyCode ?? 0;
  return (
    code === "VolumeUp" ||
    code === "VolumeDown" ||
    code === "AudioVolumeUp" ||
    code === "AudioVolumeDown" ||
    key === "VolumeUp" ||
    key === "VolumeDown" ||
    key === "AudioVolumeUp" ||
    key === "AudioVolumeDown" ||
    keyCode === 174 ||
    keyCode === 175
  );
}
