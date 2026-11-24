"use client";

import { useEffect, useRef, useState } from "react";
import { blobToBase64, sendPhoto } from "@/lib/api";
import { isHardwareShutter, openCamera, releaseCamera } from "@/lib/camera";
import { isIosDevice, setTorch, wait } from "@/lib/flash";
import { renderDisposable } from "@/lib/filter";
import { exposureLine, lapseQuip } from "@/lib/quips";
import type { EventRoll } from "@/lib/types";

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
  armed,
  devTimers,
  onDisarm,
  onSent,
}: {
  armed: EventRoll | null;
  devTimers: boolean;
  onDisarm: () => void;
  onSent: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const blobRef = useRef<Blob | null>(null);
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
  // A fast camera switch can leave mode on "live", so this tells the preview to attach the new stream.
  const [opened, setOpened] = useState(0);

  useEffect(() => {
    const stored = Number(localStorage.getItem("relapse.frames") || 0);
    if (Number.isFinite(stored)) setFrames(stored);
    const apple = isIosDevice();
    setIos(apple);
    if (apple) setLamp(true);
  }, []);

  const facingRef = useRef(facing);
  facingRef.current = facing;

  useEffect(() => {
    let cancel = false;
    async function open() {
      const stream = await openCamera(facing);
      if (cancel) return;
      if (!stream) {
        setMode("fallback");
        return;
      }
      streamRef.current = stream;
      setOpened((value) => value + 1);
      setMode("live");
    }
    setMode("opening");
    void open();
    return () => {
      cancel = true;
    };
  }, [facing]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      void openCamera(facingRef.current).then((stream) => {
        if (!stream) return;
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.style.visibility = "";
          void video.play().catch(() => undefined);
        }
        setMode("live");
      });
    };
    const park = () => {
      releaseCamera();
      streamRef.current = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") park();
      else resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", park);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", park);
      window.removeEventListener("pageshow", resume);
      releaseCamera();
      streamRef.current = null;
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
      blobRef.current = await renderDisposable(bitmap, { dateStamp });
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
      still.width = video.videoWidth;
      still.height = video.videoHeight;
      const ctx = still.getContext("2d");
      if (!ctx) return;
      // CSS mirrors the front preview. drawImage ignores that, so the JPEG stays in true orientation.
      ctx.drawImage(video, 0, 0);
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
  }, []);

  function retake() {
    bitmapRef.current?.close();
    bitmapRef.current = null;
    blobRef.current = null;
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

  async function send() {
    const blob = blobRef.current;
    if (!blob || busy) return;
    if (armed && eventClosed) {
      setError("This event just closed.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendPhoto({
        imageBase64: await blobToBase64(blob),
        caption: caption.trim(),
        eventId: armed && !eventClosed ? armed.id : null,
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
        className="viewfinder"
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
            <button type="button" onClick={onDisarm} aria-label="Stop shooting this event">
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
              ? `Sealed with ${armed.name}. The roll comes back a day after it closes, and then the frames for the feed get picked. 🔒`
              : devTimers
                ? `Short lab clock is on. ${lapseQuip(String(frames))}`
                : `${lapseQuip(String(frames))} Give it 5 to 30 minutes, then develop.`}
          </p>
          <label className="check">
            <input type="checkbox" checked={stamp} disabled={busy || rendering} onChange={() => void toggleStamp()} />
            Date stamp
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
              {busy ? "Sending…" : armed && !eventClosed ? "Send with the roll 🎞️" : "Send to the lab 🧪"}
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
