"use client";

import { useEffect, useRef, useState } from "react";
import { blobToBase64, sendPhoto } from "@/lib/api";
import { cameraWake, isHardwareShutter, openCamera, peekCamera, type CameraWake } from "@/lib/camera";
import { shouldFlipOnDoubleTap } from "@/lib/tap";
import { isIosDevice, setTorch, wait } from "@/lib/flash";
import { renderDisposable, renderLatent } from "@/lib/filter";
import { disposableDate } from "@/lib/format";
import { exposureLine, lapseQuip } from "@/lib/quips";
import type { EventRoll } from "@/lib/types";
import {
  captureFrame,
  createViewfinderZoom,
  formatZoom,
  lensTransform,
  pinchDistance,
  previewScale,
  zoomIsRest,
  type ViewfinderZoom,
} from "@/lib/zoom";

function FlashMark({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M13.4 2.2 4.8 13.1h5.4l-1.1 8.7 8.8-11.2h-5.5L13.4 2.2Z"
        fill="currentColor"
      />
      {on ? null : (
        <path d="M5 4.5 19 19.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

const LAST_EXPOSURE_KEY = "relapse.exposure";

function readLastExposure(): string | null {
  try {
    return localStorage.getItem(LAST_EXPOSURE_KEY);
  } catch {
    return null;
  }
}

function writeLastExposure(line: string) {
  try {
    localStorage.setItem(LAST_EXPOSURE_KEY, line);
  } catch {
    /* the next shot can repeat if this device refuses storage */
  }
}

function clickSound() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const audio = new Ctx();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = 1640;
  gain.gain.setValueAtTime(0.035, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.05);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.06);
  window.setTimeout(() => void audio.close(), 200);
}

export function Shoot({
  active,
  armed,
  devTimers,
  onDisarm,
  onSent,
}: {
  active: boolean;
  armed: EventRoll | null;
  devTimers: boolean;
  onDisarm: () => void;
  onSent: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const capturedAtRef = useRef<number | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const rollInput = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [mode, setMode] = useState<"opening" | "live" | "fallback">("opening");
  const [sealed, setSealed] = useState(false);
  const [stamp, setStamp] = useState(true);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [burst, setBurst] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);
  const [ios, setIos] = useState(false);
  const [lamp, setLamp] = useState(false);
  const [frames, setFrames] = useState(0);
  const [sealLine, setSealLine] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [zoom, setZoom] = useState(1);
  const [optical, setOptical] = useState(false);
  // A fast camera switch can leave mode on "live", so this tells the preview to attach the new stream.
  const [opened, setOpened] = useState(0);
  const finderRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const flipRef = useRef<() => void>(() => {});
  const lastFlip = useRef(0);
  const engineRef = useRef<ViewfinderZoom | null>(null);
  if (engineRef.current == null) {
    engineRef.current = createViewfinderZoom((state) => {
      setZoom(state.zoom);
      setOptical(state.optical);
    });
  }

  useEffect(() => {
    const stored = Number(localStorage.getItem("relapse.frames") || 0);
    if (Number.isFinite(stored)) setFrames(stored);
    const apple = isIosDevice();
    setIos(apple);
    if (apple) setLamp(true);
  }, []);

  const facingRef = useRef(facing);
  facingRef.current = facing;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const sealedRef = useRef(sealed);
  sealedRef.current = sealed;

  const wakeRef = useRef<(event: CameraWake) => void>(() => {});
  const openedShoot = useRef(false);

  function attachStream(stream: MediaStream) {
    streamRef.current = stream;
    engineRef.current?.adopt(stream.getVideoTracks()[0] ?? null);
    setOpened((value) => value + 1);
    setMode("live");
  }

  function wake(event: CameraWake) {
    const ready = peekCamera(facingRef.current);
    const action = cameraWake(event, ready != null);
    if (action === "keep") return;
    if (action === "reuse" && ready) {
      attachStream(ready);
      return;
    }
    void openCamera(facingRef.current).then((stream) => {
      if (!stream) {
        if (!peekCamera(facingRef.current)) setMode("fallback");
        return;
      }
      attachStream(stream);
    });
  }
  wakeRef.current = wake;

  useEffect(() => {
    let cancel = false;
    const ready = peekCamera(facing);
    if (ready && cameraWake("show-shoot", true) === "reuse") {
      attachStream(ready);
      return;
    }
    engineRef.current?.adopt(null);
    async function open() {
      const stream = await openCamera(facing);
      if (cancel) return;
      if (!stream) {
        streamRef.current = null;
        engineRef.current?.adopt(null);
        setMode("fallback");
        return;
      }
      attachStream(stream);
    }
    setMode("opening");
    void open();
    return () => {
      cancel = true;
    };
  }, [facing]);

  useEffect(() => {
    // The re-prompt lived here. visibilitychange (hidden) and pagehide both
    // called releaseCamera(), which stopped every track. Coming back ran
    // openCamera(), and camera.ts request() called getUserMedia because no
    // video track was still live. The effect cleanup did the same stop when
    // Shoot unmounted. Keep the track. Ask only when none is live. pagehide
    // and blur are not listened for, so they cannot stop it either.
    const onVisibility = () => {
      wakeRef.current(document.visibilityState === "hidden" ? "visibility-hidden" : "visibility-visible");
    };
    const onPageShow = () => wakeRef.current("pageshow");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!openedShoot.current) {
      openedShoot.current = true;
      return;
    }
    wakeRef.current("show-shoot");
  }, [active]);

  useEffect(() => {
    const finder = finderRef.current;
    const engine = engineRef.current;
    if (!finder || !engine) return;

    let session: { distance: number; zoom: number; moved: boolean } | null = null;
    let lastTap: { x: number; y: number; at: number } | null = null;
    let pinchGesture = false;
    const live = () => modeRef.current === "live" && !sealedRef.current;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) pinchGesture = true;
      if (!live() || event.touches.length !== 2) return;
      const distance = pinchDistance(event.touches[0], event.touches[1]);
      if (!(distance > 0)) return;
      session = { distance, zoom: engine.zoom, moved: false };
    };

    const onMove = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
      if (!session || !live()) return;
      const distance = pinchDistance(event.touches[0], event.touches[1]);
      const before = engine.zoom;
      engine.pinch(session.zoom, session.distance, distance);
      if (engine.zoom !== before) session.moved = true;
    };

    const onEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      if (session?.moved) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 500);
      }
      session = null;
      if (event.touches.length > 0) return;
      const pinched = pinchGesture;
      pinchGesture = false;
      if (pinched || !live()) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const onControl =
        event.target instanceof Element && Boolean(event.target.closest("button, a, input, textarea, label"));
      const next = { x: touch.clientX, y: touch.clientY, at: Date.now() };
      if (shouldFlipOnDoubleTap({ live: true, onControl, pinched: false, previous: lastTap, next })) {
        lastTap = null;
        event.preventDefault();
        flipRef.current();
        return;
      }
      lastTap = onControl ? null : next;
    };

    const onCancel = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      session = null;
      if (event.touches.length === 0) pinchGesture = false;
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !live()) return;
      event.preventDefault();
      engine.wheel(event.deltaY);
    };

    const stopGesture = (event: Event) => {
      event.preventDefault();
    };

    finder.addEventListener("touchstart", onStart, { passive: true });
    finder.addEventListener("touchmove", onMove, { passive: false });
    finder.addEventListener("touchend", onEnd, { passive: false });
    finder.addEventListener("touchcancel", onCancel);
    finder.addEventListener("wheel", onWheel, { passive: false });
    finder.addEventListener("gesturestart", stopGesture, { passive: false });
    finder.addEventListener("gesturechange", stopGesture, { passive: false });
    return () => {
      finder.removeEventListener("touchstart", onStart);
      finder.removeEventListener("touchmove", onMove);
      finder.removeEventListener("touchend", onEnd);
      finder.removeEventListener("touchcancel", onCancel);
      finder.removeEventListener("wheel", onWheel);
      finder.removeEventListener("gesturestart", stopGesture);
      finder.removeEventListener("gesturechange", stopGesture);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || sealed) return;
    video.style.visibility = "";
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [mode, sealed, opened]);

  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!armed) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [armed]);

  function conceal() {
    const line = exposureLine(readLastExposure());
    writeLastExposure(line);
    setSealLine(line);
    setSealed(true);
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.style.visibility = "hidden";
  }

  function revealLens() {
    setSealed(false);
    const video = videoRef.current;
    if (!video) return;
    video.style.visibility = "";
    void video.play().catch(() => undefined);
  }

  function yieldFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async function paint(bitmap: ImageBitmap, dateStamp: boolean) {
    setRendering(true);
    setError("");
    try {
      const captured = capturedAtRef.current ?? Date.now();
      const openEvent = armed != null && Date.now() < armed.endsAt;
      blobRef.current = openEvent
        ? await renderDisposable(bitmap, {
            dateStamp,
            date: dateStamp ? new Date(captured) : undefined,
            chemistry: "default",
          })
        : await renderLatent(bitmap);
    } catch (err) {
      if (!blobRef.current) revealLens();
      setError(err instanceof Error ? err.message : "The frame didn't take.");
    } finally {
      setRendering(false);
    }
  }

  async function takeBitmap(bitmap: ImageBitmap) {
    bitmapRef.current?.close();
    bitmapRef.current = bitmap;
    capturedAtRef.current = Date.now();
    await paint(bitmap, stamp);
  }

  async function snap() {
    if (sealed || rendering) return;
    if (mode !== "live" || !videoRef.current || videoRef.current.videoWidth === 0) {
      cameraInput.current?.click();
      return;
    }
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0] ?? null;
    const rear = lamp && facing === "environment";
    const front = lamp && facing === "user";
    const lit = rear ? await setTorch(track, true) : false;
    if (lit) await wait(180);
    if (front) {
      setScreenFlash(true);
      await yieldFrame();
      await wait(320);
    }
    try {
      clickSound();
      navigator.vibrate?.(15);
      if (!front) {
        setBurst(true);
        window.setTimeout(() => setBurst(false), 90);
      }
      const still = document.createElement("canvas");
      const scale = engineRef.current?.preview() ?? 1;
      const frame = captureFrame(video.videoWidth, video.videoHeight, scale);
      still.width = Math.max(1, frame.width);
      still.height = Math.max(1, frame.height);
      const ctx = still.getContext("2d");
      if (!ctx) return;
      // CSS mirrors the front preview. This crop is centered and unflipped, so the JPEG stays in true orientation.
      // An optical zoom is already in the camera frame. A visual crop uses the same scale as the preview.
      if (scale <= 1) ctx.drawImage(video, 0, 0);
      else ctx.drawImage(video, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, still.width, still.height);
      if (front) setScreenFlash(false);
      conceal();
      await yieldFrame();
      await takeBitmap(await createImageBitmap(still));
    } finally {
      if (lit) await setTorch(track, false);
      if (front) setScreenFlash(false);
    }
  }

  async function takeFile(file: File | undefined) {
    if (!file || sealed || rendering) return;
    setError("");
    conceal();
    await yieldFrame();
    try {
      await takeBitmap(await createImageBitmap(file));
    } catch {
      revealLens();
      setError("That frame didn't open. Try a JPEG or PNG.");
    }
  }

  const snapRef = useRef(snap);
  snapRef.current = snap;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const hardware = isHardwareShutter(event);
      if (event.code !== "Space" && !hardware) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (!hardware && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;
      event.preventDefault();
      void snapRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  function flipCamera() {
    if (modeRef.current !== "live" || sealedRef.current) return;
    const now = Date.now();
    if (now - lastFlip.current < 450) return;
    lastFlip.current = now;
    setFacing((side) => (side === "environment" ? "user" : "environment"));
  }
  flipRef.current = flipCamera;

  function retake() {
    bitmapRef.current?.close();
    bitmapRef.current = null;
    blobRef.current = null;
    capturedAtRef.current = null;
    revealLens();
    setCaption("");
    setError("");
  }

  async function toggleStamp() {
    const next = !stamp;
    setStamp(next);
    if (bitmapRef.current) await paint(bitmapRef.current, next);
  }

  const eventClosed = armed != null && now >= armed.endsAt;
  const preview = previewScale(optical, zoom);
  const lensStyle = lensTransform(facing === "user", preview);

  async function send() {
    const blob = blobRef.current;
    if (!blob || busy) return;
    if (armed && eventClosed) {
      setError("This timecapsule just closed.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendPhoto({
        imageBase64: await blobToBase64(blob),
        caption: caption.trim(),
        eventId: armed && !eventClosed ? armed.id : null,
        dateStamp: stamp,
        capturedAt: capturedAtRef.current,
      });
      const next = frames + 1;
      localStorage.setItem("relapse.frames", String(next));
      setFrames(next);
      retake();
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lab didn't take the frame.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shoot" data-screen="shoot">
      <div
        ref={finderRef}
        className="viewfinder"
        data-zoom={zoom}
        data-zoom-mode={optical ? "optical" : "crop"}
        data-preview-scale={preview}
        onDoubleClick={(event) => {
          if (!(event.target instanceof Element)) return;
          if (event.target.closest("button, a, input, textarea, label")) return;
          flipCamera();
        }}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void takeFile(event.dataTransfer.files?.[0]);
        }}
      >
        {mode === "live" ? (
          <video
            ref={videoRef}
            className={["lens", facing === "user" ? "mirror" : "", sealed ? "concealed" : ""].filter(Boolean).join(" ")}
            data-facing={facing}
            style={lensStyle ? { transform: lensStyle } : undefined}
            playsInline
            muted
            autoPlay
          />
        ) : (
          <div className="empty-lens">
            <h2>{mode === "opening" ? "Opening the lens… 📸" : "Lens cap on 😎"}</h2>
            <p>
              {mode === "opening"
                ? "Asking the camera."
                : "Allow the camera, or load a frame from your roll."}
            </p>
          </div>
        )}
        <div className="sprockets left" />
        <div className="sprockets right" />
        <div className="vignette" />
        <div className="grain" />
        {burst ? <div className="flash" /> : null}
        {screenFlash ? <div className="screen-flash" /> : null}
        {mode === "live" && !sealed && !zoomIsRest(zoom) ? <div className="zoom-readout">{formatZoom(zoom)}</div> : null}
        <div className="vf-top">
          <div>
            <div className="brand">Re-Lapse ✨</div>
            <div className="stock">DISPOSABLE 💿</div>
          </div>
          <div className="counter">400 · {String(frames).padStart(2, "0")}</div>
        </div>
        {ios && mode === "live" && !sealed ? (
          <button
            className="lamp"
            type="button"
            aria-pressed={lamp}
            aria-label={lamp ? "Flash on" : "Flash off"}
            onClick={() => setLamp((on) => !on)}
          >
            <FlashMark on={lamp} />
          </button>
        ) : null}
        {armed ? (
          <div className="tape">
            {armed.name} · {eventClosed ? "closed" : "open"}
            <button type="button" onClick={onDisarm} aria-label="Stop shooting this timecapsule">
              ×
            </button>
          </div>
        ) : null}
        <div className="vf-bottom">
          <div className="shutter-housing">
            <button
              className="shutter"
              type="button"
              data-shutter
              aria-label="Shutter"
              disabled={rendering}
              onClick={() => void snap()}
            />
          </div>
          <button className="ghost" type="button" onClick={() => rollInput.current?.click()}>
            Load a frame
          </button>
        </div>
        {mode === "live" ? (
          <button className="ghost flip" type="button" onClick={() => setFacing((side) => (side === "environment" ? "user" : "environment"))}>
            Flip
          </button>
        ) : null}
      </div>
      <input
        ref={cameraInput}
        className="file"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          void takeFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={rollInput}
        className="file"
        type="file"
        accept="image/*"
        onChange={(event) => {
          void takeFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {sealed ? (
        <div className="review" data-review="sealed">
          <div className="sealed-frame" aria-hidden="true">
            <span>{sealLine}</span>
          </div>
          <p className="hint">
            {armed && !eventClosed
              ? `Sealed with ${armed.name}. The timecapsule comes back a day after it closes, and then the frames for the feed get picked. 🔒`
              : devTimers
                ? `Short lab clock is on. ${lapseQuip(String(frames))}`
                : `${lapseQuip(String(frames))} Give it 5 to 30 minutes, then develop.`}
          </p>
          <label className="stamp-toggle" data-date-stamp={stamp ? "on" : "off"}>
            <input
              type="checkbox"
              role="switch"
              checked={stamp}
              aria-checked={stamp}
              disabled={busy || rendering}
              onChange={() => void toggleStamp()}
            />
            <span className="stamp-imprint" aria-hidden="true">
              {disposableDate(new Date())}
            </span>
            <span className="stamp-copy">
              Date stamp
              <span aria-hidden="true">{stamp ? "On" : "Off"}</span>
            </span>
            <span className="stamp-track" aria-hidden="true">
              <span />
            </span>
          </label>
          <input
            className="field"
            maxLength={80}
            placeholder="Caption, if you want one"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="count">{caption.trim().length}/80</div>
          {error ? <p className="error">{error}</p> : null}
          <div className="stack">
            <button className="primary" type="button" data-send disabled={busy || rendering} onClick={() => void send()}>
              {busy ? "Sending…" : armed && !eventClosed ? "Send with the timecapsule 🎞️" : "Send to the lab 🧪"}
            </button>
            <button className="ghost" type="button" onClick={retake} disabled={busy}>
              Retake
            </button>
          </div>
        </div>
      ) : null}
      {error && !sealed ? <p className="error" style={{ position: "absolute", left: 16, right: 16, bottom: 8 }}>{error}</p> : null}
    </div>
  );
}
