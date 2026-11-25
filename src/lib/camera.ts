const CAMERA_KEY = "relapse.camera";
const LENS_COOKIE = "relapse_lens";

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
let notedFacing: Facing = "environment";

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

export function lensCookieValue(record: StoredCamera): string {
  const body: Record<string, string | boolean | null> = {
    origin: record.origin,
    granted: record.granted,
  };
  if (record.devices.environment) body.environment = record.devices.environment;
  if (record.devices.user) body.user = record.devices.user;
  return JSON.stringify(body);
}

export function recordFromLensCookie(value: string | null): StoredCamera {
  if (!value) return EMPTY_RECORD;
  try {
    return parseStoredCamera(decodeURIComponent(value));
  } catch {
    return parseStoredCamera(value);
  }
}

function mirrorLens(record: StoredCamera) {
  try {
    if (typeof document === "undefined") return;
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LENS_COOKIE}=${encodeURIComponent(lensCookieValue(record))}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {
    /* private mode */
  }
}

function readLens(): StoredCamera {
  try {
    if (typeof document === "undefined") return EMPTY_RECORD;
    for (const part of document.cookie.split(";")) {
      const trimmed = part.trim();
      if (!trimmed.startsWith(`${LENS_COOKIE}=`)) continue;
      return recordFromLensCookie(trimmed.slice(LENS_COOKIE.length + 1));
    }
  } catch {
    /* cookies can be blocked */
  }
  return EMPTY_RECORD;
}

export function loadCameraRecord(): StoredCamera {
  const local = readCameraRecord(browserStorage());
  if (local.origin || local.granted || local.devices.environment || local.devices.user) return local;
  const cookie = readLens();
  if (!(cookie.origin || cookie.granted || cookie.devices.environment || cookie.devices.user)) return EMPTY_RECORD;
  writeCameraRecord(browserStorage(), cookie);
  return cookie;
}

function commitCamera(record: StoredCamera) {
  writeCameraRecord(browserStorage(), record);
  mirrorLens(record);
}

export function savedDeviceId(stored: StoredCamera, facing: Facing, origin: string): string | null {
  if (stored.origin && origin && stored.origin !== origin) return null;
  return stored.devices[facing] ?? null;
}

export function savedCameraId(facing: Facing): string | null {
  return savedDeviceId(loadCameraRecord(), facing, readOrigin());
}

function rememberGrant(facing: Facing, deviceId: string | undefined) {
  const previous = loadCameraRecord();
  const id = deviceId && deviceId.length > 0 ? deviceId : previous.devices[facing];
  commitCamera({
    origin: readOrigin() || previous.origin,
    granted: true,
    devices: id ? { ...previous.devices, [facing]: id } : previous.devices,
  });
}

function forgetGrant() {
  const current = loadCameraRecord();
  if (!current.granted) return;
  commitCamera({ ...current, granted: false });
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

function frameSize(): Pick<MediaTrackConstraints, "width" | "height"> {
  return { width: { ideal: 1600 }, height: { ideal: 1200 } };
}

function facingConstraints(facing: Facing): MediaTrackConstraints {
  return { facingMode: { ideal: facing }, ...frameSize() };
}

export function capturePlan(input: {
  permission: CameraPermission;
  facing: Facing;
  savedDeviceId: string | null;
  visibleDeviceIds: string[];
}): MediaTrackConstraints[] | null {
  if (input.permission === "denied") return null;
  const byFacing = facingConstraints(input.facing);
  if (input.permission !== "granted") return [byFacing];
  const saved = input.savedDeviceId;
  if (saved && input.visibleDeviceIds.includes(saved)) {
    return [{ deviceId: { exact: saved }, ...frameSize() }, byFacing];
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
 * Home Screen, blur, and pagehide keep a live track. Stopping it on the way
 * out of the app is what made iOS ask again on the way back. Leaving Shoot
 * for another tab releases the track so the camera light can go out. Coming
 * back reuses a stream that is still live, and calls getUserMedia only when
 * the previous one is dead. A swipe-away ends the process, so the next launch
 * has nothing left to reuse.
 */
export function cameraWake(event: CameraWake, hasLiveTrack: boolean): "keep" | "release" | "reuse" | "request" {
  if (event === "leave-shoot") return "release";
  if (event === "visibility-hidden" || event === "pagehide" || event === "blur") return "keep";
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

function stopStream(stream: MediaStream) {
  try {
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    /* already ended */
  }
}

function stopHeld() {
  if (held) stopStream(held.stream);
  held = null;
}

function deviceIdFrom(stream: MediaStream): string | undefined {
  try {
    const id = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
    return id && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

function keepStream(facing: Facing, stream: MediaStream, mine: number): MediaStream | null {
  if (mine !== ticket) {
    stopStream(stream);
    return liveStream(facing);
  }
  rememberGrant(facing, deviceIdFrom(stream));
  if (mine !== ticket) {
    stopStream(stream);
    return liveStream(facing);
  }
  if (held && held.stream !== stream) stopStream(held.stream);
  held = { facing, stream };
  return stream;
}

/**
 * Stops the held track and drops an open that has not finished.
 * Hide, blur, and pagehide must not call this. Leaving Shoot does.
 */
export function releaseCamera() {
  ticket += 1;
  opening = null;
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
      return keepStream(facing, stream, mine);
    } catch (error) {
      const name = failureName(error);
      if (index < plan.length - 1 && shouldRetryCamera(name)) continue;
      if (name === "NotAllowedError") forgetGrant();
      return null;
    }
  }
  return null;
}

function beginOpen(facing: Facing, video: MediaTrackConstraints): Promise<MediaStream | null> {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!media?.getUserMedia) return Promise.resolve(null);
  const mine = ++ticket;
  let pending: Promise<MediaStream>;
  try {
    pending = media.getUserMedia({ audio: false, video });
  } catch (error) {
    if (failureName(error) === "NotAllowedError") forgetGrant();
    return Promise.resolve(null);
  }
  const promise = pending.then(
    (stream) => keepStream(facing, stream, mine),
    (error: unknown) => {
      if (failureName(error) === "NotAllowedError") forgetGrant();
      return mine === ticket ? null : liveStream(facing);
    },
  );
  const tracked = promise.finally(() => {
    if (opening?.promise === tracked) opening = null;
  });
  opening = { facing, promise: tracked };
  return tracked;
}

/** The facing Shoot last rendered. The tab tap reads it without waiting for an effect. */
export function noteCameraFacing(facing: Facing) {
  notedFacing = facing;
}

export function openCamera(facing: Facing): Promise<MediaStream | null> {
  noteCameraFacing(facing);
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

/**
 * Call from the tap that shows Shoot, before any await.
 * A live stream is reused. Otherwise getUserMedia runs in this turn, which is
 * the user gesture WebKit uses to skip a new prompt. The promise is the one
 * openCamera returns for this facing, so Shoot does not ask a second time.
 */
export function openCameraFromTap(): Promise<MediaStream | null> {
  const facing = notedFacing;
  const existing = liveStream(facing);
  if (existing) return Promise.resolve(existing);
  if (opening?.facing === facing) return opening.promise;
  const saved = savedDeviceId(readCameraRecord(browserStorage()), facing, readOrigin());
  const video = saved ? { deviceId: { ideal: saved }, ...facingConstraints(facing) } : facingConstraints(facing);
  return beginOpen(facing, video);
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
