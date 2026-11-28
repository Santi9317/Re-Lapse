"use client";

import { useEffect, useRef, useState } from "react";
import { blobToBase64, sendPhoto } from "@/lib/api";
import {
  cameraWake,
  isHardwareShutter,
  noteCameraFacing,
  openCamera,
  peekCamera,
  releaseCamera,
  type CameraWake,
} from "@/lib/camera";
import { readDateStamp } from "@/lib/date-stamp";
import { shouldFlipOnDoubleTap } from "@/lib/tap";
import { isIosDevice, setTorch, SHUTTER_BLINK_MS, wait } from "@/lib/flash";
import { renderDisposable, renderLatent } from "@/lib/filter";
import { shotDestination } from "@/lib/gallery-shoot";
import type { EventRoll, GalleryRoll } from "@/lib/types";
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
  gallery,
  onDisarm,
  onLeaveGallery,
  onSent,
}: {
  active: boolean;
  armed: EventRoll | null;
  gallery: GalleryRoll | null;
  onDisarm: () => void;
  onLeaveGallery: () => void;
  onSent: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const rollInput = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [mode, setMode] = useState<"opening" | "live" | "fallback">("opening");
  const [error, setError] = useState("");
  const [blink, setBlink] = useState(0);
  const [screenFlash, setScreenFlash] = useState(false);
  const [ios, setIos] = useState(false);
  const [lamp, setLamp] = useState(false);
  const [frames, setFrames] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const snapping = useRef(false);
  const framesRef = useRef(0);
  const onSentRef = useRef(onSent);
  const armedRef = useRef(armed);
  const galleryRef = useRef(gallery);
  framesRef.current = frames;
  onSentRef.current = onSent;
  armedRef.current = armed;
  galleryRef.current = gallery;
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

  useEffect(() => {
    if (blink === 0) return;
    const id = window.setTimeout(() => {
      setBlink((current) => (current === blink ? 0 : current));
    }, SHUTTER_BLINK_MS);
    return () => window.clearTimeout(id);
  }, [blink]);

  const facingRef = useRef(facing);
  facingRef.current = facing;
  noteCameraFacing(facing);
  const activeRef = useRef(active);
  activeRef.current = active;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const wakeRef = useRef<(event: CameraWake) => void>(() => {});
  const attempt = useRef(0);

  function attachStream(stream: MediaStream) {
    streamRef.current = stream;
    engineRef.current?.adopt(stream.getVideoTracks()[0] ?? null);
    setOpened((value) => value + 1);
    setMode("live");
  }

  function wake(event: CameraWake) {
    if (event === "leave-shoot") {
      // Stop the track so iOS can drop the red camera light. The preview is
      // hidden on the other tabs; coming back opens it again.
      attempt.current += 1;
      const preview = streamRef.current;
      streamRef.current = null;
      if (preview) {
        for (const track of preview.getTracks()) track.stop();
      }
      releaseCamera();
      const video = videoRef.current;
      if (video) video.srcObject = null;
      engineRef.current?.adopt(null);
      if (modeRef.current === "live") setMode("opening");
      return;
    }
    // Another tab is showing. A page show must not turn the camera back on.
    if (!activeRef.current) return;
    const facingNow = facingRef.current;
    const ready = peekCamera(facingNow);
    const action = cameraWake(event, ready != null);
    if (action === "keep" || action === "release") return;
    if (action === "reuse" && ready) {
      attachStream(ready);
      return;
    }
    const generation = ++attempt.current;
    engineRef.current?.adopt(null);
    if (modeRef.current !== "live") setMode("opening");
    void openCamera(facingNow).then((stream) => {
      if (generation !== attempt.current) return;
      if (!activeRef.current || facingRef.current !== facingNow) return;
      if (!stream) {
        if (!peekCamera(facingNow)) {
          streamRef.current = null;
          engineRef.current?.adopt(null);
          setMode("fallback");
        }
        return;
      }
      attachStream(stream);
    });
  }
  wakeRef.current = wake;

  useEffect(() => {
    if (!active) return;
    wakeRef.current("show-shoot");
  }, [facing, active]);

  useEffect(() => {
    // Hide and pagehide keep the track. Stopping it on the way to the Home
    // Screen is what made iOS ask again. Leaving Shoot is the path that stops
    // it. pagehide and blur are not listened for.
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
    if (active) return;
    wakeRef.current("leave-shoot");
  }, [active]);

  useEffect(() => {
    const finder = finderRef.current;
    const engine = engineRef.current;
    if (!finder || !engine) return;

    let session: { distance: number; zoom: number; moved: boolean } | null = null;
    let lastTap: { x: number; y: number; at: number } | null = null;
    let pinchGesture = false;
    const live = () => modeRef.current === "live";

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
    if (!video || !stream) return;
    video.style.visibility = "";
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [mode, opened]);

  useEffect(() => {
    if (!armed) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [armed]);

  function yieldFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  function noteFrame() {
    const next = framesRef.current + 1;
    framesRef.current = next;
    try {
      localStorage.setItem("relapse.frames", String(next));
    } catch {
      /* the counter can catch up on the next shot */
    }
    setFrames(next);
  }

  // The shutter hands this frame to the lab and leaves the finder live for the next shot.
  async function handoff(bitmap: ImageBitmap, capturedAt: number) {
    try {
      const destination = shotDestination(capturedAt, armedRef.current, galleryRef.current?.id ?? null);
      const openEvent = destination.eventId != null;
      const stamp = openEvent && readDateStamp();
      const blob = openEvent
        ? await renderDisposable(bitmap, {
            dateStamp: stamp,
            date: stamp ? new Date(capturedAt) : undefined,
            chemistry: "default",
          })
        : await renderLatent(bitmap);
      await sendPhoto({
        imageBase64: await blobToBase64(blob),
        caption: "",
        eventId: destination.eventId,
        albumId: destination.albumId,
        dateStamp: stamp,
        capturedAt,
      });
      noteFrame();
      onSentRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lab didn't take the frame.");
    } finally {
      bitmap.close();
    }
  }

  async function snap() {
    if (snapping.current) return;
    if (mode !== "live" || !videoRef.current || videoRef.current.videoWidth === 0) {
      cameraInput.current?.click();
      return;
    }
    snapping.current = true;
    setError("");
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0] ?? null;
    const rear = lamp && facing === "environment";
    const front = lamp && facing === "user";
    let lit = false;
    try {
      lit = rear ? await setTorch(track, true) : false;
      if (lit) await wait(180);
      if (front) {
        setScreenFlash(true);
        await yieldFrame();
        await wait(320);
      }
      clickSound();
      navigator.vibrate?.(15);
      if (!front) setBlink((count) => count + 1);
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
      const capturedAt = Date.now();
      const bitmap = await createImageBitmap(still);
      window.setTimeout(() => {
        void handoff(bitmap, capturedAt);
      }, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The frame didn't take.");
    } finally {
      snapping.current = false;
      if (lit) await setTorch(track, false);
      if (front) setScreenFlash(false);
    }
  }

  async function takeFile(file: File | undefined) {
    if (!file || snapping.current) return;
    setError("");
    snapping.current = true;
    try {
      const capturedAt = Date.now();
      const bitmap = await createImageBitmap(file);
      window.setTimeout(() => {
        void handoff(bitmap, capturedAt);
      }, 0);
    } catch {
      setError("That frame didn't open. Try a JPEG or PNG.");
    } finally {
      snapping.current = false;
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
    if (modeRef.current !== "live") return;
    const now = Date.now();
    if (now - lastFlip.current < 450) return;
    lastFlip.current = now;
    setFacing((side) => (side === "environment" ? "user" : "environment"));
  }
  flipRef.current = flipCamera;

  const eventClosed = armed != null && (now < armed.startsAt || now >= armed.endsAt);
  const preview = previewScale(optical, zoom);
  const lensStyle = lensTransform(facing === "user", preview);

  return (
    <div
      className="shoot"
      data-screen="shoot"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void takeFile(event.dataTransfer.files?.[0]);
      }}
    >
      <div className="vf-top">
        <div>
          <div className="brand">Re-Lapse ✨</div>
          <div className="stock">DISPOSABLE 💿</div>
        </div>
        <div className="vf-meta">
          <div className="counter">400 · {String(frames).padStart(2, "0")}</div>
          {ios && mode === "live" ? (
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
        </div>
      </div>
      {armed ? (
        <div className="tape">
          {armed.name} · {eventClosed ? "closed" : "open"}
          <button type="button" onClick={onDisarm} aria-label="Stop shooting this timecapsule">
            ×
          </button>
        </div>
      ) : gallery ? (
        <div className="tape" data-gallery-roll={gallery.id}>
          {gallery.name} · gallery
          <button type="button" onClick={onLeaveGallery} aria-label="Stop shooting for this gallery">
            ×
          </button>
        </div>
      ) : null}
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
      >
        <div className="shoot-sizer">
          {/* 4:5 paper print. The shutter's cover crop is this same frame. */}
          <div className="shoot-window" data-shoot-window>
          <div className="shoot-print">
            {mode === "live" ? (
              <video
                ref={videoRef}
                className={["lens", facing === "user" ? "mirror" : ""].filter(Boolean).join(" ")}
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
            {blink > 0 ? (
              <div key={blink} className="flash" style={{ animationDuration: `${SHUTTER_BLINK_MS}ms` }} />
            ) : null}
            {screenFlash ? <div className="screen-flash" /> : null}
            {mode === "live" && !zoomIsRest(zoom) ? <div className="zoom-readout">{formatZoom(zoom)}</div> : null}
          </div>
          </div>
        </div>
      </div>
      {error ? <p className="error shoot-error">{error}</p> : null}
      <div className="vf-bottom">
        <div className="shutter-housing">
          <button
            className="shutter"
            type="button"
            data-shutter
            aria-label="Shutter"
            onClick={() => void snap()}
          />
        </div>
        <button className="ghost" type="button" onClick={() => rollInput.current?.click()}>
          Load a frame
        </button>
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
    </div>
  );
}
