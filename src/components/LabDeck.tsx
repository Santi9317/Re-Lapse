"use client";

import { useEffect, useRef, useState } from "react";
import { Lab } from "@/components/Lab";
import { PullRefresh } from "@/components/PullRefresh";
import { deletePhoto, fetchLab, fetchPrivateImage } from "@/lib/api";
import { disposableDate } from "@/lib/format";
import {
  commitSwipe,
  restoreSwipe,
  swipeTilt,
  swipeVerdict,
  type SwipeUndo,
  type SwipeVerdict,
} from "@/lib/lab-swipe";
import { lapseQuip } from "@/lib/quips";
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
  return { id: item.id, caption: item.caption.trim() || "Developed frame", stamp };
}

export function LabDeck({
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
  const [soup, setSoup] = useState(false);
  const [prints, setPrints] = useState<Print[]>([]);
  const [developing, setDeveloping] = useState(0);
  const [undo, setUndo] = useState<SwipeUndo | null>(null);
  const [held, setHeld] = useState<Print | null>(null);
  const [error, setError] = useState("");
  const deckRef = useRef<Print[]>([]);
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
  }, [revision, refresh]);

  function commit(verdict: SwipeVerdict) {
    const result = commitSwipe(deckRef.current, verdict);
    if (!result) return;
    deckRef.current = result.deck;
    setPrints(result.deck);
    setHeld(result.frame);
    setUndo(result.undo);
    passed.current.add(result.frame.id);
    if (verdict === "delete") pendingDelete.current.add(result.frame.id);
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
  }

  if (soup) {
    return (
      <Lab
        revision={revision}
        refresh={refresh}
        onPublished={onPublished}
        onDeleted={onDeleted}
        leading={
          <button type="button" className="lab-swipe-soup-btn" data-close-soup onClick={() => setSoup(false)}>
            Print
          </button>
        }
      />
    );
  }

  const frame = prints[0] ?? null;
  const next = prints[1] ?? null;
  const liveUndo = held && undo && undo.id === held.id ? { frame: held, verdict: undo.verdict } : null;

  return (
    <PullRefresh data-screen="lab" data-lab-view="swipe" onRefresh={() => loadRef.current()}>
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
            onSoup={() => setSoup(true)}
          />
        ) : (
          <Soup count={developing} onSoup={() => setSoup(true)} />
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
  onSoup,
}: {
  frame: Print;
  next: Print | null;
  developing: number;
  undo: { frame: Print; verdict: SwipeVerdict } | null;
  onCommit: (verdict: SwipeVerdict) => void;
  onUndo: () => void;
  onSoup: () => void;
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
            aria-label={`${frame.caption}. Swipe right to keep, swipe left to delete.`}
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
      <Tray developing={developing} dx={shown} undo={undo} onUndo={onUndo} onSoup={onSoup} />
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
  onSoup,
}: {
  developing: number;
  dx: number;
  undo: { frame: Print; verdict: SwipeVerdict } | null;
  onUndo: () => void;
  onSoup: () => void;
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
      <button type="button" className="lab-swipe-soup-btn" data-open-soup onClick={onSoup}>
        Soup
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

function Soup({ count, onSoup }: { count: number; onSoup: () => void }) {
  return (
    <div className="lab-swipe-soup">
      <div className="safelight" />
      <div className="lab-swipe-soup-copy">
        <p className="kicker">In the soup</p>
        <p className="time" data-developing-count={count}>
          {count}
        </p>
        <p className="lab-swipe-countword">developing</p>
        <p className="lab-swipe-quip">{count > 0 ? lapseQuip("lab-soup") : "Shoot a frame and let it lapse."}</p>
        <button type="button" className="lab-swipe-soup-btn" data-open-soup onClick={onSoup}>
          Soup
        </button>
      </div>
    </div>
  );
}
