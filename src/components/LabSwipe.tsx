"use client";

import { useEffect, useRef, useState } from "react";
import { LabFrame, type FrameScene } from "@/components/LabSwipeFrames";
import { isExtraChemistry, nextChemistry, type ExtraChemistry } from "@/lib/chemistry";
import { countdown } from "@/lib/format";
import { lapseQuip } from "@/lib/quips";
import type { MainTab } from "@/lib/refresh";
import type { Chemistry } from "@/lib/types";
import {
  commitSwipe,
  poseOffset,
  restoreSwipe,
  swipeTilt,
  swipeVerdict,
  undoAfterTabChange,
  type LabPose,
  type SwipeUndo,
  type SwipeVerdict,
} from "@/lib/lab-swipe";

type PreviewFrame = {
  id: string;
  caption: string;
  stamp: string;
  scene: FrameScene;
};

const FRAMES: PreviewFrame[] = [
  { id: "pier", caption: "The pier, just after the sun sat down", stamp: "11 28 '26", scene: "pier" },
  { id: "night", caption: "The corner that stays open", stamp: "11 02 '26", scene: "night" },
  { id: "window", caption: "Morning in the kitchen", stamp: "10 14 '26", scene: "window" },
];

const DEVELOPING = 3;
const SOUP_QUIP = lapseQuip("preview-soup");

const TABS = [
  ["shoot", "Shoot", "📸"],
  ["lab", "Lab", "🧪"],
  ["feed", "Feed", "✨"],
  ["rolls", "Keepsakes", "🎞️"],
  ["you", "You", "🪪"],
] as const;

type Board = {
  developing: number;
  frame: PreviewFrame | null;
  next: PreviewFrame | null;
  dx: number;
  dragging: boolean;
  flight: boolean;
  undo: { frame: PreviewFrame; verdict: SwipeVerdict } | null;
};

function posedBoard(pose: LabPose): Board {
  if (pose === "developing") {
    return { developing: 4, frame: null, next: null, dx: 0, dragging: false, flight: false, undo: null };
  }
  const frame = FRAMES[0] ?? null;
  const next = FRAMES[1] ?? null;
  if (pose === "keep" || pose === "delete") {
    return {
      developing: DEVELOPING,
      frame,
      next,
      dx: poseOffset(pose),
      dragging: true,
      flight: false,
      undo: null,
    };
  }
  if (pose === "undo") {
    return {
      developing: DEVELOPING,
      frame: FRAMES[1] ?? null,
      next: FRAMES[2] ?? null,
      dx: 0,
      dragging: false,
      flight: false,
      undo: FRAMES[0] ? { frame: FRAMES[0], verdict: "delete" } : null,
    };
  }
  return { developing: DEVELOPING, frame, next, dx: 0, dragging: false, flight: false, undo: null };
}

export function LabSwipePreview({ pose }: { pose: LabPose | null }) {
  const scripted = pose ? posedBoard(pose) : null;
  const [tab, setTab] = useState<MainTab>("lab");
  const [deck, setDeck] = useState(FRAMES);
  const [held, setHeld] = useState<PreviewFrame | null>(null);
  const [undo, setUndo] = useState<SwipeUndo | null>(null);
  const deckRef = useRef(FRAMES);
  const settleRef = useRef<(() => void) | null>(null);

  function commit(verdict: SwipeVerdict) {
    const frame = deckRef.current[0];
    if (!frame) return;
    const result = commitSwipe(deckRef.current, verdict);
    if (!result) return;
    deckRef.current = result.deck;
    setDeck(result.deck);
    setHeld(frame);
    setUndo(result.undo);
  }

  function chooseTab(next: MainTab) {
    if (scripted) return;
    settleRef.current?.();
    setTab(next);
    setUndo((current) => undoAfterTabChange(current, next));
    if (next !== "lab") setHeld(null);
  }

  function undoSwipe() {
    if (!held || !undo || undo.id !== held.id) return;
    const next = restoreSwipe(deckRef.current, held, undo);
    deckRef.current = next;
    setDeck(next);
    setHeld(null);
    setUndo(null);
  }

  const openUndo = undoAfterTabChange(undo, tab);
  const liveUndo = held && openUndo && openUndo.id === held.id ? { frame: held, verdict: openUndo.verdict } : null;
  const live: Board = {
    developing: DEVELOPING,
    frame: deck[0] ?? null,
    next: deck[1] ?? null,
    dx: 0,
    dragging: false,
    flight: false,
    undo: liveUndo,
  };
  const board = scripted ?? live;
  const onLab = scripted ? true : tab === "lab";
  const [soupOpen, setSoupOpen] = useState(false);
  const showSoup = pose === "soup" || (pose === null && soupOpen);

  function openSoup() {
    if (scripted) return;
    setSoupOpen(true);
  }

  function closeSoup() {
    if (scripted) return;
    setSoupOpen(false);
  }

  return (
    <div className="desk">
      <div className="phone pin-tabs" data-screen="lab-preview" data-pose={pose ?? "live"} data-tab={onLab ? "lab" : tab}>
        <header className="top">
          <h1 className="word">Re-Lapse ✨</h1>
          <p className="lede">Right keeps the print. Left lets it go.</p>
        </header>
        <div className="stage">
          {onLab && showSoup ? (
            <SoupList onClose={closeSoup} />
          ) : onLab ? (
            <LabBoard
              board={board}
              posed={Boolean(scripted)}
              onCommit={commit}
              onUndo={undoSwipe}
              onSoup={openSoup}
              settleRef={settleRef}
            />
          ) : (
            <div className="scroll">
              <div className="empty" data-left-lab="true">
                <h2>You left the lab.</h2>
                <p>The last swipe stays. Undo does not.</p>
              </div>
            </div>
          )}
        </div>
        <nav className="nav">
          {TABS.map(([id, label, emoji]) => (
            <button key={id} type="button" aria-pressed={onLab ? id === "lab" : tab === id} onClick={() => chooseTab(id)}>
              <span className="nav-emoji" aria-hidden="true">
                {emoji}
              </span>
              {label}
              {id === "lab" && board.developing > 0 ? <sup>{board.developing}</sup> : null}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function LabBoard({
  board,
  posed,
  onCommit,
  onUndo,
  onSoup,
  settleRef,
}: {
  board: Board;
  posed: boolean;
  onCommit: (verdict: SwipeVerdict) => void;
  onUndo: () => void;
  onSoup: () => void;
  settleRef: { current: (() => void) | null };
}) {
  if (!board.frame) {
    return (
      <div className="lab-swipe" data-posed={posed ? "true" : "false"} data-lab-swipe="developing">
        <Soup count={board.developing} />
      </div>
    );
  }
  return (
    <div className="lab-swipe" data-posed={posed ? "true" : "false"} data-lab-swipe="print">
      {posed ? (
        <>
          <Print frame={board.frame} next={board.next} dx={board.dx} dragging={board.dragging} flight={false} width={360} />
          <Tray developing={board.developing} dx={board.dx} undo={board.undo} onUndo={onUndo} onSoup={onSoup} />
        </>
      ) : (
        <LivePrint
          frame={board.frame}
          next={board.next}
          developing={board.developing}
          undo={board.undo}
          onCommit={onCommit}
          onUndo={onUndo}
          onSoup={onSoup}
          settleRef={settleRef}
        />
      )}
    </div>
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
  settleRef,
}: {
  frame: PreviewFrame;
  next: PreviewFrame | null;
  developing: number;
  undo: Board["undo"];
  onCommit: (verdict: SwipeVerdict) => void;
  onUndo: () => void;
  onSoup: () => void;
  settleRef: { current: (() => void) | null };
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
  settleRef.current = settle;

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

  function onTransitionEnd(event: React.TransitionEvent<HTMLDivElement>) {
    if (event.propertyName !== "transform" || event.target !== event.currentTarget) return;
    if (!pending.current) return;
    settle();
  }

  const shown = flight ?? dx;
  return (
    <>
      <Print
        wellRef={wellRef}
        frame={frame}
        next={next}
        dx={shown}
        dragging={dragging}
        flight={flight != null}
        width={width}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onTransitionEnd={onTransitionEnd}
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
      />
      <Tray developing={developing} dx={shown} undo={undo} onUndo={onUndo} onSoup={onSoup} />
    </>
  );
}

function Print({
  frame,
  next,
  dx,
  dragging,
  flight,
  width,
  wellRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onTransitionEnd,
  onKeyDown,
}: {
  frame: PreviewFrame;
  next: PreviewFrame | null;
  dx: number;
  dragging: boolean;
  flight: boolean;
  width: number;
  wellRef?: React.Ref<HTMLDivElement>;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onTransitionEnd?: (event: React.TransitionEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const keepFade = dx > 0 ? Math.min(1, dx / 84) : 0;
  const deleteFade = dx < 0 ? Math.min(1, -dx / 84) : 0;
  const tilt = swipeTilt(dx, width);
  const lift = dragging ? 1.02 : 1;
  return (
    <div className="lab-swipe-stage">
      <div className="lab-swipe-well" ref={wellRef} data-lab-swipe="well">
        {next ? (
          <div className="lab-swipe-next" aria-hidden="true">
            <LabFrame scene={next.scene} title={next.caption} id={`${next.id}-under`} />
          </div>
        ) : (
          <div className="lab-swipe-next lab-swipe-next-soup" aria-hidden="true">
            <div className="safelight" />
          </div>
        )}
        <div
          className="lab-swipe-wash"
          data-side={dx < 0 ? "delete" : "keep"}
          style={{ opacity: Math.max(keepFade, deleteFade) }}
          aria-hidden="true"
        />
        <div
          className="lab-swipe-card"
          data-dragging={dragging ? "true" : "false"}
          data-flight={flight ? "true" : "false"}
          data-frame={frame.id}
          role="group"
          tabIndex={0}
          aria-label={`${frame.caption}. Swipe right to keep, swipe left to delete.`}
          style={{ transform: `translate3d(${dx}px, 0, 0) rotate(${tilt}deg) scale(${lift})` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onTransitionEnd={onTransitionEnd}
          onKeyDown={onKeyDown}
        >
          <LabFrame scene={frame.scene} title={frame.caption} stamp={frame.stamp} id={frame.id} />
          <span className="lab-swipe-mark" data-verdict="keep" style={{ opacity: keepFade }} aria-hidden="true">
            Keep
          </span>
          <span className="lab-swipe-mark" data-verdict="delete" style={{ opacity: deleteFade }} aria-hidden="true">
            Delete
          </span>
        </div>
      </div>
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
  undo: Board["undo"];
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
          <span className="lab-swipe-undo-thumb" aria-hidden="true">
            <LabFrame scene={undo.frame.scene} title="" id={`${undo.frame.id}-undo`} />
          </span>
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

function Soup({ count }: { count: number }) {
  return (
    <div className="lab-swipe-soup">
      <div className="safelight" />
      <div className="lab-swipe-soup-copy">
        <p className="kicker">In the soup</p>
        <p className="time" data-developing-count={count}>
          {count}
        </p>
        <p className="lab-swipe-countword">developing</p>
        <p className="lab-swipe-quip">{count > 0 ? SOUP_QUIP : "Shoot a frame and let it lapse."}</p>
      </div>
    </div>
  );
}

const EXTRA_BATHS: { id: ExtraChemistry; label: string }[] = [
  { id: "daylight", label: "Daylight" },
  { id: "night", label: "Night" },
];

const SOUP_FRAMES: { id: string; remain: number; chemistry: Chemistry | null }[] = [
  { id: "soup-pier", remain: 12 * 60_000 + 40_000, chemistry: "daylight" },
  { id: "soup-night", remain: 48 * 60_000, chemistry: null },
  { id: "soup-window", remain: 3 * 60_000 + 12_000, chemistry: "night" },
];

function SoupList({ onClose }: { onClose: () => void }) {
  const [frames, setFrames] = useState(SOUP_FRAMES);

  function pick(id: string, tapped: ExtraChemistry) {
    setFrames((current) =>
      current.map((frame) => (frame.id === id ? { ...frame, chemistry: nextChemistry(frame.chemistry, tapped) } : frame)),
    );
  }

  return (
    <div className="scroll" data-lab-swipe="soup">
      <button type="button" className="lab-swipe-soup-btn" data-close-soup onClick={onClose}>
        Print
      </button>
      {frames.map((frame) => (
        <article className="lab-card" key={frame.id} data-lab-state="developing">
          <div className="thumb sealed-thumb" data-hidden-frame={frame.id}>
            <div className="safelight" />
            <span>In the soup 🧪</span>
          </div>
          <div>
            <div className="kicker">Developing 🌀</div>
            <div className="time" data-countdown={frame.id}>
              {countdown(frame.remain)}
            </div>
            <p>{lapseQuip(frame.id)}</p>
            <SoupBath chemistry={frame.chemistry} id={frame.id} onPick={(bath) => pick(frame.id, bath)} />
            <p>The bath waits with the frame.</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function SoupBath({
  chemistry,
  id,
  onPick,
}: {
  chemistry: Chemistry | null;
  id: string;
  onPick: (chemistry: ExtraChemistry) => void;
}) {
  const chosen = isExtraChemistry(chemistry);
  const [open, setOpen] = useState(chosen);

  useEffect(() => {
    if (chosen) setOpen(true);
  }, [chosen]);

  if (!open) {
    return (
      <div className="bath" role="group" aria-label="Chemistry" data-bath={id} data-selected={chemistry ?? "unset"}>
        <button type="button" data-additional-chemistry={id} onClick={() => setOpen(true)}>
          Additional chemistry
        </button>
      </div>
    );
  }

  return (
    <div className="bath" role="group" aria-label="Chemistry" data-bath={id} data-selected={chemistry ?? "unset"}>
      {EXTRA_BATHS.map((bath) => (
        <button
          key={bath.id}
          type="button"
          data-chemistry={bath.id}
          aria-pressed={chemistry === bath.id}
          onClick={() => onPick(bath.id)}
        >
          {bath.label}
        </button>
      ))}
    </div>
  );
}
