"use client";

import { useEffect, useRef, useState } from "react";
import { DateStampToggle, Lab } from "@/components/Lab";
import { PullRefresh } from "@/components/PullRefresh";
import { developPhoto, fetchLab, fetchPrivateImage, publishPhoto, updateCaption } from "@/lib/api";
import { developBath } from "@/lib/chemistry";
import { readDateStamp, writeDateStamp } from "@/lib/date-stamp";
import { developFrame } from "@/lib/develop-frame";
import { disposableDate } from "@/lib/format";
import { commitSwipe, restoreSwipe, swipeTilt, swipeVerdict, type SwipeUndo, type SwipeVerdict } from "@/lib/lab-swipe";
import type { Chemistry, LabItem, LabState } from "@/lib/types";

type Print = {
  id: string;
  caption: string;
  stamp: string;
  chemistry: Chemistry | null;
  graded: boolean;
  capturedAt: number | null;
  developed: boolean;
};

function cardState(item: LabItem, now: number): LabState {
  if (item.labState === "sealed" || item.labState === "developed") return item.labState;
  if (item.labState === "ready" || item.readyAt - now <= 0) return "ready";
  return "developing";
}

function toPrint(item: LabItem): Print {
  const when = new Date(item.capturedAt ?? item.createdAt);
  const stamp = item.dateStamp && Number.isFinite(when.getTime()) ? disposableDate(when) : "";
  const developed = item.labState === "developed";
  return {
    id: item.id,
    caption: item.caption,
    stamp,
    chemistry: item.chemistry,
    graded: item.graded || developed,
    capturedAt: item.capturedAt,
    developed,
  };
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
  const [readyCount, setReadyCount] = useState(0);
  const [prints, setPrints] = useState<Print[]>([]);
  const [developing, setDeveloping] = useState(0);
  const [undo, setUndo] = useState<SwipeUndo | null>(null);
  const [held, setHeld] = useState<Print | null>(null);
  const [prompt, setPrompt] = useState<Print | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [stamp, setStamp] = useState(true);
  const [gradeAttempt, setGradeAttempt] = useState(0);
  const deckRef = useRef<Print[]>([]);
  const readyRef = useRef<Print[]>([]);
  const placeRef = useRef(place);
  const promptRef = useRef<Print | null>(null);
  const passed = useRef(new Set<string>());
  const publishedAny = useRef(false);
  const grading = useRef(new Set<string>());
  const stampRef = useRef(true);
  const onPublishedRef = useRef(onPublished);
  placeRef.current = place;
  promptRef.current = prompt;
  onPublishedRef.current = onPublished;
  const loadRef = useRef<() => Promise<void>>(async () => {});

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
        const now = Date.now();
        let soupCount = 0;
        const ready: Print[] = [];
        const byId = new Map(data.photos.map((photo) => [photo.id, photo]));
        for (const photo of data.photos) {
          const state = cardState(photo, now);
          if (state === "developing") soupCount += 1;
          if (state === "ready" && !passed.current.has(photo.id)) ready.push(toPrint(photo));
        }
        readyRef.current = ready;
        setReadyCount(ready.length);
        setDeveloping(soupCount);
        if (placeRef.current === "swipe") {
          const promptId = promptRef.current?.id;
          setPrints((current) => {
            const wanted = new Map<string, Print>();
            for (const print of ready) {
              if (print.id !== promptId) wanted.set(print.id, print);
            }
            for (const row of current) {
              if (passed.current.has(row.id) || row.id === promptId) continue;
              const photo = byId.get(row.id);
              if (!photo) continue;
              const state = cardState(photo, now);
              if (state !== "ready" && state !== "developed") continue;
              const next = toPrint(photo);
              wanted.set(row.id, {
                ...next,
                developed: row.developed || next.developed,
                graded: row.graded || next.graded,
              });
            }
            const kept = current.filter((row) => wanted.has(row.id)).map((row) => wanted.get(row.id) as Print);
            const seen = new Set(kept.map((row) => row.id));
            const next = [...kept, ...ready.filter((row) => !seen.has(row.id) && row.id !== promptId)];
            deckRef.current = next;
            return next;
          });
        }
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
  }, [revision, refresh]);

  const homeSeen = useRef<number | null>(null);
  useEffect(() => {
    if (homeSeen.current === null) {
      homeSeen.current = homeTick;
      return;
    }
    if (homeSeen.current === homeTick) return;
    homeSeen.current = homeTick;
    setPlace("select");
    setPrompt(null);
    setHeld(null);
    setUndo(null);
  }, [homeTick]);

  const top = prints[0] ?? null;
  const topKey = top ? `${top.id}:${top.developed ? "1" : "0"}:${gradeAttempt}` : "";
  useEffect(() => {
    if (place !== "swipe" || prompt || !top || top.developed) return;
    const frame = top;
    if (grading.current.has(frame.id)) return;
    grading.current.add(frame.id);
    let alive = true;
    setError("");
    const task = frame.graded
      ? developPhoto(frame.id).then(() => undefined)
      : developFrame(
          { id: frame.id, capturedAt: frame.capturedAt },
          { chemistry: developBath(frame.chemistry), stamp: readDateStamp() },
        );
    void task
      .then(() => {
        if (!alive) return;
        setPrints((current) => {
          const next = current.map((row) =>
            row.id === frame.id ? { ...row, developed: true, graded: true } : row,
          );
          deckRef.current = next;
          return next;
        });
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "That frame can't be developed yet.");
      })
      .finally(() => {
        grading.current.delete(frame.id);
      });
    return () => {
      alive = false;
    };
  }, [place, prompt, topKey]);

  function finish() {
    const published = publishedAny.current;
    publishedAny.current = false;
    setPrompt(null);
    setHeld(null);
    setUndo(null);
    setPlace("select");
    if (published) onPublishedRef.current();
  }

  function commit(verdict: SwipeVerdict) {
    const frame = deckRef.current[0];
    if (!frame || !frame.developed || promptRef.current) return;
    const result = commitSwipe(deckRef.current, verdict);
    if (!result) return;
    deckRef.current = result.deck;
    setPrints(result.deck);
    setHeld(result.frame);
    setUndo(result.undo);
    if (verdict === "feed") {
      setPrompt(result.frame);
      return;
    }
    passed.current.add(result.frame.id);
    if (result.deck.length === 0) finish();
  }

  function undoSwipe() {
    if (!held || !undo || undo.id !== held.id) return;
    const next = restoreSwipe(deckRef.current, held, undo);
    deckRef.current = next;
    setPrints(next);
    passed.current.delete(held.id);
    setPrompt(null);
    setHeld(null);
    setUndo(null);
  }

  async function publishFrame(frame: Print, caption: string | null) {
    if (busyId) return;
    setBusyId(frame.id);
    setError("");
    try {
      if (caption != null && caption.trim() !== frame.caption.trim()) {
        await updateCaption(frame.id, caption.trim());
      }
      await publishPhoto(frame.id);
      passed.current.add(frame.id);
      publishedAny.current = true;
      setPrompt(null);
      setHeld(null);
      setUndo(null);
      if (deckRef.current.length === 0) finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame isn't ready to share.");
    } finally {
      setBusyId((current) => (current === frame.id ? null : current));
    }
  }

  useEffect(() => {
    if (place !== "swipe" || prompt || prints.length > 0) return;
    const published = publishedAny.current;
    publishedAny.current = false;
    setHeld(null);
    setUndo(null);
    setPlace("select");
    if (published) onPublishedRef.current();
  }, [place, prompt, prints.length]);

  function openDevelop() {
    const queue = readyRef.current.filter((print) => !passed.current.has(print.id));
    if (queue.length === 0) return;
    deckRef.current = queue;
    setPrints(queue);
    setPrompt(null);
    setHeld(null);
    setUndo(null);
    setError("");
    setPlace("swipe");
  }

  function reloadSwipe() {
    setGradeAttempt((value) => value + 1);
    return loadRef.current();
  }

  if (place === "darkroom") {
    return (
      <Lab
        revision={revision}
        refresh={refresh}
        onPublished={onPublished}
        onDeleted={onDeleted}
        screen="darkroom"
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
      <PullRefresh data-screen="lab" data-lab-view="select" onRefresh={() => loadRef.current()}>
        {error ? <p className="error">{error}</p> : null}
        <DateStampToggle stamp={stamp} onToggle={toggleStamp} />
        {readyCount > 0 ? (
          <div className="lab-ready">
            <div className="sealed-frame" aria-hidden="true">
              <span>Ready</span>
            </div>
            <p className="lab-ready-count" data-ready-count={readyCount}>
              <span className="time">{readyCount}</span>
              <span>{readyCount === 1 ? "photo is ready" : "photos are ready"}</span>
            </p>
            <button className="primary" type="button" data-develop-ready onClick={openDevelop}>
              Develop
            </button>
          </div>
        ) : (
          <div className="empty">
            <h2>Nothing to develop.</h2>
            <p>When a photo is ready, it shows up here as one frame.</p>
          </div>
        )}
        <button type="button" className="lab-swipe-soup-btn" data-open-darkroom onClick={() => setPlace("darkroom")}>
          Darkroom{developing > 0 ? ` · ${developing}` : ""}
        </button>
      </PullRefresh>
    );
  }

  const frame = prints[0] ?? null;
  const next = prints[1] ?? null;
  const liveUndo = held && undo && undo.id === held.id ? undo : null;

  return (
    <PullRefresh data-screen="lab" data-lab-view="swipe" onRefresh={reloadSwipe}>
      {error ? <p className="error">{error}</p> : null}
      <div className="lab-swipe" data-live="true" data-lab-swipe={prompt ? "caption" : frame ? "print" : "empty"}>
        {prompt ? (
          <>
            <div className="lab-swipe-stage">
              <div className="lab-swipe-well" data-lab-swipe="well">
                <div className="lab-swipe-card" data-frame={prompt.id}>
                  <Shot id={prompt.id} alt={prompt.caption.trim() || "Developed frame"} stamp={prompt.stamp} />
                </div>
              </div>
            </div>
            <CaptionPrompt
              frame={prompt}
              busy={busyId === prompt.id}
              onSkip={() => void publishFrame(prompt, null)}
              onAdd={(caption) => void publishFrame(prompt, caption)}
            />
          </>
        ) : frame ? (
          <LivePrint frame={frame} next={next} onCommit={commit} />
        ) : (
          <div className="empty">
            <h2>No photo to swipe.</h2>
            <p>When a photo is ready, Develop opens it here.</p>
          </div>
        )}
        {liveUndo ? (
          <button type="button" className="lab-undo-mini" data-undo-action={liveUndo.verdict} onClick={undoSwipe}>
            Undo
          </button>
        ) : null}
      </div>
    </PullRefresh>
  );
}

function CaptionPrompt({
  frame,
  busy,
  onSkip,
  onAdd,
}: {
  frame: Print;
  busy: boolean;
  onSkip: () => void;
  onAdd: (caption: string) => void;
}) {
  const [value, setValue] = useState(frame.caption);
  const trimmed = value.trim();
  const changed = trimmed.length > 0 && trimmed !== frame.caption.trim();
  return (
    <div className="lab-caption-prompt" role="dialog" aria-labelledby="caption-prompt-title">
      <h2 id="caption-prompt-title">Add a caption?</h2>
      <input
        className="field"
        maxLength={80}
        placeholder="Caption, if you want one"
        aria-label="Caption"
        data-caption={frame.id}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
      />
      <button className="primary" type="button" data-skip-caption disabled={busy} onClick={onSkip}>
        {busy ? "Sending…" : "Skip"}
      </button>
      {changed ? (
        <button type="button" data-add-caption disabled={busy} onClick={() => onAdd(trimmed)}>
          Add caption
        </button>
      ) : null}
    </div>
  );
}

function LivePrint({
  frame,
  next,
  onCommit,
}: {
  frame: Print;
  next: Print | null;
  onCommit: (verdict: SwipeVerdict) => void;
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
  const locked = !frame.developed;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const node = wellRef.current;
    if (!node) return;
    const measure = () => setWidth(node.offsetWidth || 360);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [frame.id, locked]);

  function settle() {
    const verdict = pending.current;
    if (!verdict) return;
    pending.current = null;
    setFlight(null);
    setDx(0);
    onCommitRef.current(verdict);
  }

  function down(event: React.PointerEvent<HTMLDivElement>) {
    if (locked || flight != null) return;
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
    setFlight(verdict === "feed" ? travel : -travel);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => settle(), 420);
  }

  const shown = flight ?? dx;
  const feedFade = shown > 0 ? Math.min(1, shown / 84) : 0;
  const passFade = shown < 0 ? Math.min(1, -shown / 84) : 0;
  const tilt = swipeTilt(shown, width);
  const label = frame.caption.trim() || "Developed frame";
  return (
    <div className="lab-swipe-stage">
      <div className="lab-swipe-well" ref={wellRef} data-lab-swipe="well">
        {next ? (
          <div className="lab-swipe-next" aria-hidden="true">
            {next.developed ? <Shot id={next.id} alt="" /> : <div className="safelight" />}
          </div>
        ) : (
          <div className="lab-swipe-next lab-swipe-next-soup" aria-hidden="true">
            <div className="safelight" />
          </div>
        )}
        {frame.developed ? (
          <>
            <div
              className="lab-swipe-wash"
              data-side={shown < 0 ? "pass" : "feed"}
              style={{ opacity: Math.max(feedFade, passFade) }}
              aria-hidden="true"
            />
            <div
              className="lab-swipe-card"
              data-dragging={dragging ? "true" : "false"}
              data-flight={flight != null ? "true" : "false"}
              data-frame={frame.id}
              role="group"
              tabIndex={0}
              aria-label={`${label}. Swipe right to send it to the feed. Swipe left to keep it off the feed.`}
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
                if (pending.current || locked) return;
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  onCommit("feed");
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  onCommit("pass");
                }
              }}
            >
              <Shot id={frame.id} alt={label} stamp={frame.stamp} />
              <span className="lab-swipe-mark" data-verdict="feed" style={{ opacity: feedFade }} aria-hidden="true">
                Feed
              </span>
              <span className="lab-swipe-mark" data-verdict="pass" style={{ opacity: passFade }} aria-hidden="true">
                Pass
              </span>
            </div>
          </>
        ) : (
          <div className="sealed-frame lab-swipe-pending" data-frame={frame.id}>
            <span>Developing</span>
          </div>
        )}
      </div>
    </div>
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
