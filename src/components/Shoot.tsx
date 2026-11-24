"use client";

import { useEffect, useRef, useState } from "react";
import { blobToBase64, sendPhoto } from "@/lib/api";
import { renderDisposable } from "@/lib/filter";
import { lapseQuip } from "@/lib/quips";
import type { EventRoll } from "@/lib/types";

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
  const [flash, setFlash] = useState(false);
  const [frames, setFrames] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stored = Number(localStorage.getItem("relapse.frames") || 0);
    if (Number.isFinite(stored)) setFrames(stored);
  }, []);

  useEffect(() => {
    let cancel = false;
    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancel) setMode("fallback");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1600 },
            height: { ideal: 1200 },
          },
        });
        if (cancel) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        setMode("live");
      } catch {
        if (!cancel) setMode("fallback");
      }
    }
    setMode("opening");
    void open();
    return () => {
      cancel = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facing]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || sealed) return;
    video.style.visibility = "";
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [mode, sealed]);

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
    clickSound();
    navigator.vibrate?.(15);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 90);
    const video = videoRef.current;
    const still = document.createElement("canvas");
    still.width = video.videoWidth;
    still.height = video.videoHeight;
    const ctx = still.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    conceal();
    await yieldFrame();
    await takeBitmap(await createImageBitmap(still));
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
      if (event.code !== "Space") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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
          <video ref={videoRef} className={sealed ? "lens concealed" : "lens"} playsInline muted autoPlay />
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
        {flash ? <div className="flash" /> : null}
        <div className="vf-top">
          <div>
            <div className="brand">Re-Lapse ✨</div>
            <div className="stock">DISPOSABLE 💿</div>
          </div>
          <div className="counter">400 · {String(frames).padStart(2, "0")}</div>
        </div>
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
            <span>Exposed 📸</span>
          </div>
          <p className="hint">
            {armed && !eventClosed
              ? `Sealed with ${armed.name}. The whole roll lapses back a day after close. 🔒`
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
