const CAMERA_KEY = "relapse.camera";

export type Facing = "environment" | "user";

type SavedCameras = Partial<Record<Facing, string>>;

type Held = { facing: Facing; stream: MediaStream };

let held: Held | null = null;
let opening: { facing: Facing; promise: Promise<MediaStream | null> } | null = null;

function readSaved(): SavedCameras {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(CAMERA_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedCameras;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function remember(facing: Facing, deviceId: string) {
  if (!deviceId || typeof localStorage === "undefined") return;
  const saved = readSaved();
  saved[facing] = deviceId;
  localStorage.setItem(CAMERA_KEY, JSON.stringify(saved));
}

export function savedCameraId(facing: Facing): string | null {
  const id = readSaved()[facing];
  return typeof id === "string" && id.length > 0 ? id : null;
}

function liveStream(facing: Facing): MediaStream | null {
  if (!held || held.facing !== facing) return null;
  const live = held.stream.getVideoTracks().some((track) => track.readyState === "live");
  if (!live) {
    held = null;
    return null;
  }
  return held.stream;
}

export function releaseCamera() {
  held?.stream.getTracks().forEach((track) => track.stop());
  held = null;
}

async function request(facing: Facing): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  releaseCamera();
  const savedId = savedCameraId(facing);
  const attempts: MediaTrackConstraints[] = [];
  if (savedId) {
    attempts.push({ deviceId: { exact: savedId }, width: { ideal: 1600 }, height: { ideal: 1200 } });
  }
  attempts.push({ facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 1200 } });
  for (const video of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      const track = stream.getVideoTracks()[0];
      const deviceId = track?.getSettings?.().deviceId;
      if (deviceId) remember(facing, deviceId);
      held = { facing, stream };
      return stream;
    } catch {
      /* the saved camera can disappear; the next attempt asks by facing */
    }
  }
  return null;
}

export function openCamera(facing: Facing): Promise<MediaStream | null> {
  const existing = liveStream(facing);
  if (existing) return Promise.resolve(existing);
  if (opening?.facing === facing) return opening.promise;
  const promise = request(facing).finally(() => {
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
