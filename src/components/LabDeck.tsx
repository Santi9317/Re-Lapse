"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaptionField } from "@/components/CaptionField";
import { Lab } from "@/components/Lab";
import { PullRefresh } from "@/components/PullRefresh";
import { deletePhoto, fetchLab, fetchPrivateImage, publishPhoto, updateCaption } from "@/lib/api";
import { disposableDate } from "@/lib/format";
import { ensurePhotoFile, iosPhotosTarget, readyPhotoFile, shareOrSave } from "@/lib/save";
import {
  commitSwipe,
  restoreSwipe,
  swipeTilt,
  swipeVerdict,
  type SwipeUndo,
  type SwipeVerdict,
} from "@/lib/lab-swipe";
import type { LabItem, LabState } from "@/lib/types";

type Print = { id: string; caption: string; stamp: string };

function cardState(item: LabItem, now: number): LabState {
  if (item.labState === "sealed" || item.labState === "developed") return item.labState;
  if (item.labState === "ready" || item.readyAt - now <= 0) return "ready";
  return "developing";
}

function toPrint(item: LabItem): Print {
  const when = new Date(item.capturedAt ?? item.createdAt);
  const stamp = item.dateStamp && Number.isFinite(when.getTime()) ? disposableDate(when) : "";
  return { id: item.id, caption: item.caption, stamp };
}

export function LabDeck({
  revision,
  refresh = 0,
  homeTick = 0,
  onPublished,
  onDeleted,
}: {
  revision: number;
  refresh?: number;
  homeTick?: number;
  onPublished: () => void;
  onDeleted?: () => void;
}) {
  const [place, setPlace] = useState<"select" | "swipe" | "darkroom">("select");
  const [prints, setPrints] = useState<Print[]>([]);
  const [developing, setDeveloping] = useState(0);
  const [undo, setUndo] = useState<SwipeUndo | null>(null);
  const [held, setHeld] = useState<Print | null>(null);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [deckBump, setDeckBump] = useState(0);
  const [aside, setAside] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const deckRef = useRef<Print[]>([]);
  const focusRef = useRef<string | null>(null);
  const captionDrafts = useRef(new Map<string, string>());
  focusRef.current = focusId;
  const passed = useRef(new Set<string>());
  const pendingDelete = useRef(new Set<string>());
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const pending = pendingDelete;
    return () => {
      const ids = [...pending.current];
      pending.current.clear();
      for (const id of ids) {
        void deletePhoto(id)
          .then(() => onDeletedRef.current?.())
          .catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const data = await fetchLab();
        if (stop) return;
        const now = Date.now();
        let soupCount = 0;
        const ready: Print[] = [];
        for (const photo of data.photos) {
          const state = cardState(photo, now);
          if (state === "developing") soupCount += 1;
          if (state === "developed" && !passed.current.has(photo.id)) ready.push(toPrint(photo));
        }
        const focus = focusRef.current;
        if (focus) {
          const index = ready.findIndex((print) => print.id === focus);
          if (index > 0) {
            const [hit] = ready.splice(index, 1);
            ready.unshift(hit);
          }
        }
        setDeveloping(soupCount);
        setPrints((current) => {
          const incoming = new Map(ready.map((print) => [print.id, print]));
          const kept = current.filter((print) => incoming.has(print.id)).map((print) => incoming.get(print.id) as Print);
          const seen = new Set(kept.map((print) => print.id));
          const next = [...kept, ...ready.filter((print) => !seen.has(print.id))];
          deckRef.current = next;
          return next;
        });
        setError("");
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
    loadRef.current = load;
    void load();
    const poll = window.setInterval(() => void load(), 4000);
    return () => {
      stop = true;
      window.clearInterval(poll);
    };
  }, [revision, refresh, deckBump]);

  const homeSeen = useRef<number | null>(null);
  useEffect(() => {
    if (homeSeen.current === null) {
      homeSeen.current = homeTick;
      return;
    }
    if (homeSeen.current === homeTick) return;
    homeSeen.current = homeTick;
    setPlace("select");
    setFocusId(null);
  }, [homeTick]);

  function rememberAside() {
    setAside([...passed.current]);
  }

  function commit(verdict: SwipeVerdict) {
    const result = commitSwipe(deckRef.current, verdict);
    if (!result) return;
    if (verdict === "keep") {
      const draft = (captionDrafts.current.get(result.frame.id) ?? result.frame.caption).trim();
      if (draft !== result.frame.caption.trim()) {
        void updateCaption(result.frame.id, draft).catch(() => setError("That caption didn't stick."));
      }
    }
    deckRef.current = result.deck;
    setPrints(result.deck);
    setHeld(result.frame);
    setUndo(result.undo);
    passed.current.add(result.frame.id);
    if (verdict === "delete") pendingDelete.current.add(result.frame.id);
    rememberAside();
  }

  function undoSwipe() {
    if (!held || !undo || undo.id !== held.id) return;
    const next = restoreSwipe(deckRef.current, held, undo);
    deckRef.current = next;
    setPrints(next);
    passed.current.delete(held.id);
    pendingDelete.current.delete(held.id);
    setHeld(null);
    setUndo(null);
    rememberAside();
  }

  function openSwipe(id: string) {
    setFocusId(id);
    setPrints((current) => {
      const hit = current.find((print) => print.id === id);
      const next = hit ? [hit, ...current.filter((print) => print.id !== id)] : [{ id, caption: "", stamp: "" }, ...current];
      deckRef.current = next;
      return next;
    });
    setPlace("swipe");
    setDeckBump((value) => value + 1);
  }

  async function publish(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError("");
    try {
      const frame = deckRef.current.find((print) => print.id === id);
      const draft = (captionDrafts.current.get(id) ?? frame?.caption ?? "").trim();
      if (frame && draft !== frame.caption.trim()) {
        const saved = await updateCaption(id, draft);
        captionDrafts.current.set(id, saved.caption);
      }
      await publishPhoto(id);
      captionDrafts.current.delete(id);
      passed.current.add(id);
      const next = deckRef.current.filter((print) => print.id !== id);
      deckRef.current = next;
      setPrints(next);
      rememberAside();
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame isn't ready to share.");
    } finally {
      setBusyId((current) => (current === id ? null : current));
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

  const frames = (
    <div className="lab-switch">
      <button type="button" data-open-darkroom onClick={() => setPlace("darkroom")}>
        Darkroom{developing > 0 ? ` · ${developing}` : ""}
      </button>
      {prints.length > 0 ? (
        <button type="button" data-open-swipe onClick={() => setPlace("swipe")}>
          Swipe
        </button>
      ) : null}
    </div>
  );

  if (place === "darkroom") {
    return (
      <Lab
        revision={revision}
        refresh={refresh + deckBump}
        onPublished={onPublished}
        onDeleted={onDeleted}
        screen="darkroom"
        aside={aside}
        leading={
          <button type="button" className="ghost back" data-close-darkroom onClick={() => setPlace("select")}>
            ← Frames
          </button>
        }
      />
    );
  }

  if (place === "select") {
    return (
      <Lab
        revision={revision}
        refresh={refresh + deckBump}
        onPublished={onPublished}
        onDeleted={onDeleted}
        screen="select"
        aside={aside}
        onSwipe={openSwipe}
        leading={frames}
      />
    );
  }

  const frame = prints[0] ?? null;
  const next = prints[1] ?? null;
  const liveUndo = held && undo && undo.id === held.id ? { frame: held, verdict: undo.verdict } : null;

  return (
    <PullRefresh data-screen="lab" data-lab-view="swipe" onRefresh={() => loadRef.current()}>
      <button type="button" className="ghost back" data-lab-home onClick={() => setPlace("select")}>
        ← Frames
      </button>
      {error ? <p className="error">{error}</p> : null}
      <div className="lab-swipe" data-live="true" data-lab-swipe={frame ? "print" : "developing"}>
        {frame ? (
          <LivePrint
            frame={frame}
            next={next}
            developing={developing}
            undo={liveUndo}
            onCommit={commit}
            onUndo={undoSwipe}
            onDarkroom={() => setPlace("darkroom")}
            extra={
              <div className="lab-swipe-caption">
                <CaptionField
                  id={frame.id}
                  caption={frame.caption}
                  disabled={busyId === frame.id}
                  onDraft={(photoId, value) => {
                    captionDrafts.current.set(photoId, value);
                  }}
                />
                <button
                  className="primary"
                  type="button"
                  data-publish={frame.id}
                  disabled={busyId === frame.id}
                  onClick={() => void publish(frame.id)}
                >
                  {busyId === frame.id ? "Sending…" : "Send to the feed"}
                </button>
                <button
                  type="button"
                  data-download={frame.id}
                  aria-label={iosPhotosTarget() ? "Download this photo to Photos" : "Download this photo"}
                  disabled={savingId === frame.id}
                  onClick={() => saveFrame(frame.id)}
                >
                  {savingId === frame.id ? "Saving…" : "Download"}
                </button>
              </div>
            }
          />
        ) : (
          <div className="empty">
            <h2>No print to swipe.</h2>
            <p>Develop a frame, then it shows up here.</p>
          </div>
        )}
      </div>
    </PullRefresh>
  );
}

function LivePrint({
  frame,
  next,
  developing,
  undo,
  onCommit,
  onUndo,
  onDarkroom,
  extra,
}: {
  frame: Print;
  next: Print | null;
  developing: number;
  undo: { frame: Print; verdict: SwipeVerdict } | null;
  onCommit: (verdict: SwipeVerdict) => void;
  onUndo: () => void;
  onDarkroom: () => void;
  extra?: ReactNode;
}) {
  const wellRef = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const drag = useRef<{ pointer: number; x: number; dx: number } | null>(null);
  const pending = useRef<SwipeVerdict | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flight, setFlight] = useState<number | null>(null);
  const [width, setWidth] = useState(360);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const node = wellRef.current;
    if (!node) return;
    const measure = () => setWidth(node.offsetWidth || 360);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [frame.id]);

  function settle() {
    const verdict = pending.current;
    if (!verdict) return;
    pending.current = null;
    setFlight(null);
    setDx(0);
    onCommitRef.current(verdict);
  }

  function down(event: React.PointerEvent<HTMLDivElement>) {
    if (flight != null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, dx: 0 };
    setDragging(true);
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.dx = event.clientX - current.x;
    setDx(current.dx);
  }

  function up(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    const verdict = swipeVerdict(current.dx);
    if (!verdict) {
      setDx(0);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pending.current = verdict;
    if (reduced) {
      settle();
      return;
    }
    const travel = (wellRef.current?.offsetWidth ?? 360) + 140;
    setFlight(verdict === "keep" ? travel : -travel);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => settle(), 420);
  }

  const shown = flight ?? dx;
  const keepFade = shown > 0 ? Math.min(1, shown / 84) : 0;
  const deleteFade = shown < 0 ? Math.min(1, -shown / 84) : 0;
  const tilt = swipeTilt(shown, width);
  return (
    <>
      <div className="lab-swipe-stage">
        <div className="lab-swipe-well" ref={wellRef} data-lab-swipe="well">
          {next ? (
            <div className="lab-swipe-next" aria-hidden="true">
              <Shot id={next.id} alt="" />
            </div>
          ) : (
            <div className="lab-swipe-next lab-swipe-next-soup" aria-hidden="true">
              <div className="safelight" />
            </div>
          )}
          <div
            className="lab-swipe-wash"
            data-side={shown < 0 ? "delete" : "keep"}
            style={{ opacity: Math.max(keepFade, deleteFade) }}
            aria-hidden="true"
          />
          <div
            className="lab-swipe-card"
            data-dragging={dragging ? "true" : "false"}
            data-flight={flight != null ? "true" : "false"}
            data-frame={frame.id}
            role="group"
            tabIndex={0}
            aria-label={`${frame.caption.trim() || "Developed frame"}. Swipe right to keep, swipe left to delete.`}
            style={{ transform: `translate3d(${shown}px, 0, 0) rotate(${tilt}deg) scale(${dragging ? 1.02 : 1})` }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onTransitionEnd={(event) => {
              if (event.propertyName !== "transform" || event.target !== event.currentTarget) return;
              if (pending.current) settle();
            }}
            onKeyDown={(event) => {
              if (pending.current) return;
              if (event.key === "ArrowRight") {
                event.preventDefault();
                onCommit("keep");
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                onCommit("delete");
              }
            }}
          >
            <Shot id={frame.id} alt={frame.caption} stamp={frame.stamp} />
            <span className="lab-swipe-mark" data-verdict="keep" style={{ opacity: keepFade }} aria-hidden="true">
              Keep
            </span>
            <span className="lab-swipe-mark" data-verdict="delete" style={{ opacity: deleteFade }} aria-hidden="true">
              Delete
            </span>
          </div>
        </div>
      </div>
      {extra}
      <Tray developing={developing} dx={shown} undo={undo} onUndo={onUndo} onDarkroom={onDarkroom} />
    </>
  );
}

function Shot({ id, alt, stamp }: { id: string; alt: string; stamp?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    fetchPrivateImage(id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return (
    <div className="lab-swipe-photo" data-live="true">
      {src ? <img src={src} alt={alt} draggable={false} /> : null}
      {stamp ? <span className="lab-swipe-date">{stamp}</span> : null}
    </div>
  );
}

function Tray({
  developing,
  dx,
  undo,
  onUndo,
  onDarkroom,
}: {
  developing: number;
  dx: number;
  undo: { frame: Print; verdict: SwipeVerdict } | null;
  onUndo: () => void;
  onDarkroom: () => void;
}) {
  const hint = 1 - Math.min(1, Math.abs(dx) / 84);
  return (
    <div className="lab-swipe-tray">
      {developing > 0 ? (
        <p className="lab-swipe-countline" data-developing={developing}>
          <span className="kicker">In the soup</span>
          <span className="lab-swipe-countrow">
            <span className="time" data-developing-count={developing}>
              {developing}
            </span>
            <span className="lab-swipe-countword">developing</span>
          </span>
        </p>
      ) : null}
      <button type="button" className="lab-swipe-soup-btn" data-open-darkroom onClick={onDarkroom}>
        Darkroom
      </button>
      {undo ? (
        <div className="lab-swipe-undo" data-undo={undo.verdict}>
          <span>
            <strong>{undo.verdict === "keep" ? "Kept" : "Deleted"}</strong>
            <p>{undo.verdict === "keep" ? "Still yours." : "Undo puts it back."}</p>
          </span>
          <button type="button" className="primary" data-undo-action={undo.verdict} onClick={onUndo}>
            Undo
          </button>
        </div>
      ) : (
        <p className="lab-swipe-hint" style={{ opacity: hint }} aria-hidden={hint < 0.4 ? true : undefined}>
          <span>← Delete</span>
          <span>Keep →</span>
        </p>
      )}
    </div>
  );
}

