"use client";

import { useEffect, useRef, useState } from "react";
import { developPhoto, deletePhoto, fetchLab, fetchPrivateImage, publishPhoto } from "@/lib/api";
import { countdown, longRemain } from "@/lib/format";
import { lapseQuip } from "@/lib/quips";
import { ensurePhotoFile, iosPhotosTarget, readyPhotoFile, rememberPhotoBlob, shareOrSave } from "@/lib/save";
import type { LabItem, LabState } from "@/lib/types";

function cardState(item: LabItem, now: number): LabState {
  if (item.labState === "sealed" || item.labState === "developed") return item.labState;
  if (item.labState === "ready" || item.readyAt - now <= 0) return "ready";
  return "developing";
}

export function Lab({
  revision,
  onPublished,
  onDeleted,
}: {
  revision: number;
  onPublished: () => void;
  onDeleted?: () => void;
}) {
  const [items, setItems] = useState<LabItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const developedIds = useRef(new Set<string>());

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const data = await fetchLab();
        if (stop) return;
        for (const photo of data.photos) {
          if (photo.labState === "developed") developedIds.current.delete(photo.id);
        }
        setItems(
          data.photos.map((photo) =>
            developedIds.current.has(photo.id) ? { ...photo, labState: "developed" } : photo,
          ),
        );
        setError("");
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
    void load();
    const poll = window.setInterval(() => void load(), 4000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [revision]);

  async function develop(id: string) {
    setBusy(id);
    setError("");
    try {
      await developPhoto(id);
      developedIds.current.add(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, labState: "developed" } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame can't be developed yet.");
    } finally {
      setBusy(null);
    }
  }

  async function publish(id: string) {
    setBusy(id);
    setError("");
    try {
      await publishPhoto(id);
      setItems((current) => current.filter((item) => item.id !== id));
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame isn't ready to share.");
    } finally {
      setBusy(null);
    }
  }

  function saveFrame(id: string) {
    setError("");
    const file = readyPhotoFile(id);
    if (file) {
      shareOrSave(file);
      return;
    }
    setSavingId(id);
    void ensurePhotoFile(id)
      .then((next) => shareOrSave(next))
      .catch(() => setError("That frame didn't download."))
      .finally(() => setSavingId(null));
  }

  async function remove(id: string) {
    const previous = items;
    setBusy(id);
    setError("");
    setItems((current) => current.filter((item) => item.id !== id));
    setConfirmId(null);
    try {
      await deletePhoto(id);
      onDeleted?.();
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "That frame stayed put.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scroll" data-screen="lab">
      {error ? <p className="error">{error}</p> : null}
      {items.length === 0 ? (
        <div className="empty">
          <h2>Nothing in the soup. 🧪</h2>
          <p>Shoot a frame and let it lapse. The print comes back when the clock does.</p>
        </div>
      ) : (
        items.map((item) => {
          const state = cardState(item, now);
          const remaining = item.readyAt - now;
          return (
            <article className="lab-card" key={item.id} data-lab-state={state}>
              {state === "developed" ? (
                <PrivateFrame id={item.id} alt={item.caption || "Developed frame"} />
              ) : (
                <div className="thumb sealed-thumb" data-hidden-frame={item.id}>
                  {state === "developing" ? <div className="safelight" /> : null}
                  <span>{state === "sealed" ? "Sealed 🔒" : state === "ready" ? "Ready ✨" : "In the soup 🧪"}</span>
                </div>
              )}
              <div>
                {state === "sealed" ? (
                  <>
                    <div className="kicker">Sealed 🔒</div>
                    <h2 className="time" style={{ fontSize: 32 }}>{item.eventName}</h2>
                    <p>
                      Comes back with the timecapsule
                      {item.revealAt ? ` in ${longRemain(item.revealAt - now)}` : ""}. Then the frames for the feed get picked. 🌙
                    </p>
                  </>
                ) : state === "developed" ? (
                  <>
                    <div className="kicker">Developed 🌈</div>
                    <p>{item.caption || "No caption."}</p>
                    <button
                      className="primary"
                      type="button"
                      data-publish={item.id}
                      disabled={busy === item.id}
                      onClick={() => void publish(item.id)}
                    >
                      {busy === item.id ? "Sending…" : "Send to the feed 🚀"}
                    </button>
                    <p>Your eyes only, unless you lapse it onto the feed.</p>
                  </>
                ) : state === "ready" ? (
                  <>
                    <div className="kicker">Ready ✨</div>
                    <p>{item.caption || "No caption."}</p>
                    <button
                      className="primary"
                      type="button"
                      data-develop={item.id}
                      disabled={busy === item.id}
                      onClick={() => void develop(item.id)}
                    >
                      {busy === item.id ? "Developing…" : "Develop ✨"}
                    </button>
                    <p>The lapse is over. Pop the print, then decide who else gets a look.</p>
                  </>
                ) : (
                  <>
                    <div className="kicker">Developing 🌀</div>
                    <div className="time" data-countdown={item.id}>{countdown(remaining)}</div>
                    <p>{lapseQuip(item.id)}</p>
                  </>
                )}
                <div className="lab-actions">
                  {state === "developed" ? (
                    <button
                      type="button"
                      data-download={item.id}
                      aria-label={iosPhotosTarget() ? "Download this photo to Photos" : "Download this photo"}
                      disabled={savingId === item.id}
                      onClick={() => saveFrame(item.id)}
                    >
                      {savingId === item.id ? "Saving…" : "Download"}
                    </button>
                  ) : null}
                  {confirmId === item.id ? (
                    <>
                      <button type="button" disabled={busy === item.id} onClick={() => setConfirmId(null)}>
                        Keep
                      </button>
                      <button
                        type="button"
                        data-confirm-delete={item.id}
                        disabled={busy === item.id}
                        onClick={() => void remove(item.id)}
                      >
                        {busy === item.id ? "Deleting…" : "Delete"}
                      </button>
                    </>
                  ) : (
                    <button type="button" data-delete={item.id} aria-label="Delete this frame" onClick={() => setConfirmId(item.id)}>
                      Delete
                    </button>
                  )}
                </div>
                {confirmId === item.id ? <p>Gone for good.</p> : null}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

function PrivateFrame({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    fetchPrivateImage(id)
      .then((blob) => {
        if (cancelled) return;
        rememberPhotoBlob(id, blob);
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (!src) return null;
  return <img src={src} alt={alt} />;
}
