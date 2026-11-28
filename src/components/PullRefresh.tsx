"use client";

import { useEffect, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode, type Ref } from "react";
import {
  PULL_HOLD,
  PULL_MIN_VISIBLE_MS,
  PULL_THRESHOLD,
  dampPull,
  pullArm,
  pullCommits,
  pullMove,
  shouldHoldPull,
} from "@/lib/pull-refresh";

const FIELD = "input, textarea, select, [contenteditable='true']";

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

type Phase = "idle" | "pulling" | "refreshing";

function wordFor(phase: Phase, pulled: number): string {
  if (phase === "refreshing") return "In the soup";
  if (phase === "pulling" && pullCommits(pulled)) return "A little more";
  return "Pull";
}

export function PullRefresh({
  onRefresh,
  className,
  scroll = true,
  scrollerRef,
  children,
  ...rest
}: {
  onRefresh: () => Promise<void> | void;
  className?: string;
  /** The body is the scroller. Shoot and the keepsakes hub are fixed columns. */
  scroll?: boolean;
  /** The scrolling body, so a tab can jump back to the top. */
  scrollerRef?: Ref<HTMLDivElement | null>;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "onRefresh" | "className" | "children">) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const springRef = useRef(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  function apply(px: number, phase: Phase, spring: boolean, geometry: boolean) {
    const host = hostRef.current;
    const body = bodyRef.current;
    const indicator = indicatorRef.current;
    if (!host || !body || !indicator) return;
    pullRef.current = px;
    phaseRef.current = phase;
    springRef.current = spring;
    host.dataset.pullPhase = phase;
    host.dataset.pullCommit = phase === "pulling" && pullCommits(px) ? "yes" : "no";
    host.dataset.spring = spring ? "yes" : "no";
    const progress = phase === "refreshing" ? 1 : Math.min(1, px / PULL_THRESHOLD);
    host.style.setProperty("--progress", String(progress));
    const word = host.querySelector(".pull-word");
    if (word) word.textContent = wordFor(phase, px);
    indicator.setAttribute("aria-hidden", phase === "idle" ? "true" : "false");
    if (!geometry) return;
    indicator.style.height = `${px}px`;
    // translateY(0) still springs closed. Clearing the transform waits until idle
    // so a fixed sheet inside the tab is not pinned to the sliding surface.
    body.style.transform = phase === "idle" ? "" : `translateY(${px}px)`;
  }

  useLayoutEffect(() => {
    apply(pullRef.current, phaseRef.current, springRef.current, !springRef.current);
  });

  useEffect(() => {
    const host = hostRef.current;
    const body = bodyRef.current;
    if (!host || !body) return;

    let activeId: number | null = null;
    let via: "touch" | "pointer" | null = null;
    let startX = 0;
    let startY = 0;
    let armed = false;
    let pulling = false;
    let suppressClick = false;
    let epoch = 0;
    let settleTimer = 0;

    const top = () => (scroll ? body.scrollTop : 0);

    const clearSettle = () => {
      window.clearTimeout(settleTimer);
      settleTimer = 0;
    };

    const settleIdle = (token: number) => {
      clearSettle();
      settleTimer = window.setTimeout(() => {
        if (token !== epoch) return;
        if (pullRef.current !== 0) return;
        apply(0, "idle", false, true);
      }, 520);
    };

    const springTo = (target: number, phase: Phase) => {
      const token = ++epoch;
      apply(target, phase, true, true);
      if (target === 0) settleIdle(token);
      return token;
    };

    const resetGesture = () => {
      activeId = null;
      via = null;
      armed = false;
      pulling = false;
    };

    const begin = (id: number, x: number, y: number, target: EventTarget | null, source: "touch" | "pointer") => {
      if (phaseRef.current === "refreshing") return;
      if (activeId != null) {
        const had = pulling && pullRef.current > 0;
        resetGesture();
        if (had) springTo(0, "pulling");
        return;
      }
      const element = target instanceof Element ? target : null;
      const onField = Boolean(element?.closest(FIELD));
      const onDialog = Boolean(element?.closest("[role='dialog']"));
      if (!pullArm({ scrollTop: top(), onField, onDialog, pointers: 1 })) return;
      epoch += 1;
      activeId = id;
      via = source;
      startX = x;
      startY = y;
      armed = true;
      pulling = false;
    };

    const move = (id: number, x: number, y: number, event: Event) => {
      if (id !== activeId || !armed) return;
      const dx = x - startX;
      const dy = y - startY;
      const scrollTop = top();
      if (shouldHoldPull({ dx, dy, scrollTop })) event.preventDefault();
      const decision = pullMove({ dx, dy, scrollTop });
      if (decision === "cancel") {
        const had = pulling && pullRef.current > 0;
        resetGesture();
        if (had) springTo(0, "pulling");
        return;
      }
      if (decision !== "pull") return;
      pulling = true;
      apply(dampPull(dy), "pulling", false, true);
    };

    const end = (id: number) => {
      if (id !== activeId) return;
      const wasPulling = pulling;
      const distance = pullRef.current;
      resetGesture();
      if (!wasPulling) return;
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 600);
      if (pullCommits(distance)) void runRefresh();
      else springTo(0, "pulling");
    };

    async function runRefresh() {
      const token = springTo(PULL_HOLD, "refreshing");
      const started = performance.now();
      try {
        await refreshRef.current();
      } catch {
        /* the tab shows its own error */
      }
      if (token !== epoch || phaseRef.current !== "refreshing") return;
      const wait = PULL_MIN_VISIBLE_MS - (performance.now() - started);
      if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
      if (token !== epoch || phaseRef.current !== "refreshing") return;
      springTo(0, "refreshing");
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        const had = pulling && pullRef.current > 0;
        resetGesture();
        if (had) springTo(0, "pulling");
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      begin(touch.identifier, touch.clientX, touch.clientY, event.target, "touch");
    };

    const onTouchMove = (event: TouchEvent) => {
      if (via !== "touch" || activeId == null) return;
      const touch = [...event.touches].find((item) => item.identifier === activeId);
      if (!touch) return;
      move(touch.identifier, touch.clientX, touch.clientY, event);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (via !== "touch" || activeId == null) return;
      if ([...event.touches].some((item) => item.identifier === activeId)) return;
      end(activeId);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      begin(event.pointerId, event.clientX, event.clientY, event.target, "pointer");
    };

    const onPointerMove = (event: PointerEvent) => {
      if (via !== "pointer" || event.pointerId !== activeId) return;
      move(event.pointerId, event.clientX, event.clientY, event);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (via !== "pointer" || event.pointerId !== activeId) return;
      end(event.pointerId);
    };

    const onClick = (event: MouseEvent) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    };

    host.addEventListener("touchstart", onTouchStart, { passive: true });
    host.addEventListener("touchmove", onTouchMove, { passive: false });
    host.addEventListener("touchend", onTouchEnd);
    host.addEventListener("touchcancel", onTouchEnd);
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointercancel", onPointerUp);
    host.addEventListener("click", onClick, true);
    return () => {
      clearSettle();
      host.removeEventListener("touchstart", onTouchStart);
      host.removeEventListener("touchmove", onTouchMove);
      host.removeEventListener("touchend", onTouchEnd);
      host.removeEventListener("touchcancel", onTouchEnd);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("click", onClick, true);
    };
  }, [scroll]);

  const bodyClass = ["pull-body", scroll ? "scroll" : "", className].filter(Boolean).join(" ");

  return (
    <div ref={hostRef} className="pull-host" data-pull-scroll={scroll ? "yes" : "no"}>
      <div ref={indicatorRef} className="pull-indicator" role="status" aria-live="polite" aria-hidden="true">
        <div className="pull-mark">
          <span className="pull-ring" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <circle className="pull-track" cx="12" cy="12" r="8" />
              <circle className="pull-arc" cx="12" cy="12" r="8" />
            </svg>
          </span>
          <span className="pull-word">Pull</span>
        </div>
      </div>
      <div
        ref={(node) => {
          bodyRef.current = node;
          assignRef(scrollerRef, node);
        }}
        className={bodyClass}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}
