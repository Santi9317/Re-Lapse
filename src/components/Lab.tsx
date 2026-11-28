"use client";

import { useEffect, useRef, useState } from "react";
import { blobToBase64, chooseChemistry, developPhoto, deletePhoto, fetchLab, fetchLatent, fetchPrivateImage, publishPhoto, updateCaption } from "@/lib/api";
import { CaptionField } from "@/components/CaptionField";
import { developBath, heldChemistry, isExtraChemistry, nextChemistry, type ExtraChemistry } from "@/lib/chemistry";
import { developStampDate, readDateStamp, writeDateStamp } from "@/lib/date-stamp";
import { countdown, disposableDate, longRemain } from "@/lib/format";
import { renderDisposable } from "@/lib/filter";
import { lapseQuip } from "@/lib/quips";
import { ensurePhotoFile, iosPhotosTarget, readyPhotoFile, rememberPhotoBlob, shareOrSave } from "@/lib/save";
import type { Chemistry, LabItem, LabState } from "@/lib/types";
import { useWalk, WalkMark, WalkTip } from "@/components/Walkthrough";

const EXTRA_BATHS: { id: ExtraChemistry; label: string }[] = [
  { id: "daylight", label: "Daylight" },
  { id: "night", label: "Night" },
];

function cardState(item: LabItem, now: number): LabState {
  if (item.labState === "sealed" || item.labState === "developed") return item.labState;
  if (item.labState === "ready" || item.readyAt - now <= 0) return "ready";
  return "developing";
}

export function Lab({
  revision,
  refresh = 0,
  onPublished,
  onDeleted,
}: {
  revision: number;
  refresh?: number;
  onPublished: () => void;
  onDeleted?: () => void;
}) {
  const [items, setItems] = useState<LabItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [stamp, setStamp] = useState(true);
  const [preparing, setPreparing] = useState<Set<string>>(() => new Set());
  const stampRef = useRef(true);
  const developedIds = useRef(new Set<string>());
  const pendingBath = useRef(new Map<string, Chemistry | null>());
  const bathWrite = useRef(new Map<string, Promise<void>>());
  const grading = useRef(new Set<string>());
  const finished = useRef(new Set<string>());
  const captionDrafts = useRef(new Map<string, string>());

  useEffect(() => {
    const saved = readDateStamp();
    stampRef.current = saved;
    setStamp(saved);
  }, []);

  function toggleStamp() {
    const next = !stampRef.current;
    stampRef.current = next;
    setStamp(next);
    writeDateStamp(next);
  }

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const data = await fetchLab();
        if (stop) return;
        for (const photo of data.photos) {
          if (photo.labState === "developed") {
            developedIds.current.delete(photo.id);
            pendingBath.current.delete(photo.id);
          } else if (
            pendingBath.current.has(photo.id) &&
            (pendingBath.current.get(photo.id) ?? null) === photo.chemistry
          ) {
            pendingBath.current.delete(photo.id);
          }
        }
        setItems(
          data.photos.map((photo) => {
            const chemistry = heldChemistry(pendingBath.current, photo.id, photo.chemistry);
            if (developedIds.current.has(photo.id)) {
              return { ...photo, chemistry, labState: "developed", graded: true };
            }
            return { ...photo, chemistry };
          }),
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
  }, [revision, refresh]);

  async function grade(item: LabItem, chemistry: Chemistry) {
    if (item.graded || grading.current.has(item.id) || finished.current.has(item.id)) return;
    grading.current.add(item.id);
    setBusy(item.id);
    setError("");
    try {
      const latent = await fetchLatent(item.id);
      const bitmap = await createImageBitmap(latent);
      try {
        const when = developStampDate(stampRef.current, item.capturedAt);
        const blob = await renderDisposable(bitmap, {
          chemistry,
          dateStamp: Boolean(when),
          date: when,
          seed: item.id,
        });
        await developPhoto(item.id, { imageBase64: await blobToBase64(blob), chemistry });
      } finally {
        bitmap.close();
      }
      finished.current.add(item.id);
      pendingBath.current.delete(item.id);
      developedIds.current.add(item.id);
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, labState: "developed", graded: true, chemistry } : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame can't be developed yet.");
    } finally {
      grading.current.delete(item.id);
      setBusy((current) => (current === item.id ? null : current));
    }
  }

  async function develop(id: string) {
    setBusy(id);
    setError("");
    try {
      await developPhoto(id);
      developedIds.current.add(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, labState: "developed", graded: true } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame can't be developed yet.");
    } finally {
      setBusy((current) => (current === id ? null : current));
    }
  }

  function pick(item: LabItem, tapped: ExtraChemistry) {
    if (item.graded || grading.current.has(item.id) || finished.current.has(item.id)) return;
    const next = nextChemistry(heldChemistry(pendingBath.current, item.id, item.chemistry), tapped);
    pendingBath.current.set(item.id, next);
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, chemistry: next } : row)));
    const previous = bathWrite.current.get(item.id) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(() => saveBath(item.id, next));
    bathWrite.current.set(item.id, write);
  }

  async function saveBath(id: string, next: Chemistry | null) {
    if (!pendingMatches(id, next) || finished.current.has(id)) return;
    try {
      const saved = await chooseChemistry(id, next);
      if (!pendingMatches(id, next) || grading.current.has(id) || finished.current.has(id)) return;
      pendingBath.current.set(id, saved.chemistry);
      setItems((current) => current.map((row) => (row.id === id ? { ...row, chemistry: saved.chemistry } : row)));
    } catch (err) {
      if (!pendingMatches(id, next) || grading.current.has(id) || finished.current.has(id)) return;
      pendingBath.current.delete(id);
      setError(err instanceof Error ? err.message : "That frame can't be developed yet.");
    }
  }

  function pendingMatches(id: string, chemistry: Chemistry | null): boolean {
    return pendingBath.current.has(id) && (pendingBath.current.get(id) ?? null) === chemistry;
  }

  async function publish(id: string) {
    if (!preparing.has(id)) {
      setPreparing((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
      return;
    }
    setBusy(id);
    setError("");
    try {
      const item = items.find((row) => row.id === id);
      const draft = (captionDrafts.current.get(id) ?? item?.caption ?? "").trim();
      if (item && draft !== item.caption.trim()) {
        const saved = await updateCaption(id, draft);
        captionDrafts.current.set(id, saved.caption);
        setItems((current) => current.map((row) => (row.id === id ? { ...row, caption: saved.caption } : row)));
      }
      await publishPhoto(id);
      captionDrafts.current.delete(id);
      setItems((current) => current.filter((row) => row.id !== id));
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame isn't ready to share.");
    } finally {
      setBusy((current) => (current === id ? null : current));
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
      setBusy((current) => (current === id ? null : current));
    }
  }

  const firstDeveloped = items.find((item) => cardState(item, now) === "developed")?.id ?? null;
  const labWalk = useWalk("lab", firstDeveloped !== null);

  return (
    <div className="scroll" data-screen="lab">
      {error ? <p className="error">{error}</p> : null}
      <label className="stamp-toggle" data-date-stamp={stamp ? "on" : "off"}>
        <input
          type="checkbox"
          role="switch"
          checked={stamp}
          aria-checked={stamp}
          onChange={toggleStamp}
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
      {items.length === 0 ? (
        <div className="empty">
          <h2>Nothing in the soup. 🧪</h2>
          <p>Shoot a frame and let it lapse. The print comes back when the clock does.</p>
        </div>
      ) : (
        items.map((item) => {
          const state = cardState(item, now);
          const remaining = item.readyAt - now;
          const latent = !item.graded && state !== "sealed" && state !== "developed";
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
                    {preparing.has(item.id) ? (
                      <CaptionField
                        id={item.id}
                        caption={item.caption}
                        disabled={busy === item.id}
                        onDraft={(photoId, value) => {
                          captionDrafts.current.set(photoId, value);
                        }}
                      />
                    ) : null}
                    <button
                      className="primary"
                      type="button"
                      data-publish={item.id}
                      disabled={busy === item.id}
                      onClick={() => void publish(item.id)}
                    >
                      {busy === item.id ? "Sending…" : preparing.has(item.id) ? "Put it on the feed 🚀" : "Send to the feed 🚀"}
                    </button>
                    <p>
                      {preparing.has(item.id)
                        ? "Add a caption now, or leave it blank. Once this photo is on the feed, that line stays."
                        : "Your eyes only, unless you lapse it onto the feed."}
                    </p>
                  </>
                ) : state === "ready" ? (
                  <>
                    <div className="kicker">Ready ✨</div>
                    <button
                      className="primary"
                      type="button"
                      data-develop={item.id}
                      disabled={busy === item.id}
                      onClick={() => {
                        const chemistry = developBath(heldChemistry(pendingBath.current, item.id, item.chemistry));
                        void (item.graded ? develop(item.id) : grade(item, chemistry));
                      }}
                    >
                      {busy === item.id ? "Developing…" : "Develop ✨"}
                    </button>
                    {latent ? <Bath item={item} disabled={busy === item.id} onPick={(chemistry) => void pick(item, chemistry)} /> : null}
                    <p>{latent ? "Run a bath once. It stays." : "The lapse is over. Pop the print, then decide who else gets a look."}</p>
                  </>
                ) : (
                  <>
                    <div className="kicker">Developing 🌀</div>
                    <div className="time" data-countdown={item.id}>{countdown(remaining)}</div>
                    <p>{lapseQuip(item.id)}</p>
                    {latent ? (
                      <>
                        <Bath item={item} disabled={busy === item.id} onPick={(chemistry) => void pick(item, chemistry)} />
                        <p>The bath waits with the frame.</p>
                      </>
                    ) : null}
                  </>
                )}
                {item.id === firstDeveloped && labWalk.visible ? (
                  <WalkTip id="lab" onDismiss={labWalk.dismiss} onSkip={labWalk.skip} onLater={labWalk.later} />
                ) : null}
                {item.id === firstDeveloped && labWalk.mark ? <WalkMark id="lab" onOpen={labWalk.revisit} /> : null}
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

function Bath({
  item,
  disabled,
  onPick,
}: {
  item: LabItem;
  disabled: boolean;
  onPick: (chemistry: ExtraChemistry) => void;
}) {
  const chosen = isExtraChemistry(item.chemistry);
  const [open, setOpen] = useState(chosen);

  useEffect(() => {
    if (chosen) setOpen(true);
  }, [chosen]);

  if (!open) {
    return (
      <div className="bath" role="group" aria-label="Chemistry" data-bath={item.id} data-selected={item.chemistry ?? "unset"}>
        <button
          type="button"
          data-additional-chemistry={item.id}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Additional chemistry
        </button>
      </div>
    );
  }

  return (
    <div className="bath" role="group" aria-label="Chemistry" data-bath={item.id} data-selected={item.chemistry ?? "unset"}>
      {EXTRA_BATHS.map((bath) => (
        <button
          key={bath.id}
          type="button"
          data-chemistry={bath.id}
          aria-pressed={item.chemistry === bath.id}
          disabled={disabled}
          onClick={() => onPick(bath.id)}
        >
          {bath.label}
        </button>
      ))}
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
