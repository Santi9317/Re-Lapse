"use client";

import { useEffect } from "react";
import {
  PHONE_LANDSCAPE_MAX_HEIGHT,
  lockPortrait,
  orientationAngle,
  portraitHold,
  syncPortraitHold,
} from "@/lib/orientation";

/**
 * Asks for the portrait lock on load, again if the phone turns, and once
 * more after a gesture. The gesture wait lets a pinch on the viewfinder
 * finish before a browser that requires a tap actually locks. Listeners
 * never cancel the event, so the shutter and the pinch keep it.
 */
export function PortraitLock() {
  useEffect(() => {
    const root = document.documentElement;
    let stopped = false;
    let locked = false;
    let timer = 0;

    const sync = () => {
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      const phoneSized = window.matchMedia(`(pointer: coarse) and (max-height: ${PHONE_LANDSCAPE_MAX_HEIGHT}px)`).matches;
      const legacy = (window as Window & { orientation?: number }).orientation;
      const angle = orientationAngle(typeof legacy === "number" ? legacy : null, window.screen.orientation?.angle);
      syncPortraitHold(root, portraitHold(angle, landscape, phoneSized));
    };

    const attempt = () => {
      if (stopped || locked) return;
      void lockPortrait(window.screen).then((ok) => {
        if (!stopped && ok) locked = true;
        sync();
      });
    };

    const onChange = () => {
      locked = false;
      sync();
      attempt();
    };

    const onPointerUp = () => {
      if (stopped || locked) return;
      if (!window.matchMedia("(orientation: landscape)").matches) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(attempt, 400);
    };

    sync();
    attempt();
    const landscapeQuery = window.matchMedia("(orientation: landscape)");
    landscapeQuery.addEventListener("change", onChange);
    window.addEventListener("orientationchange", onChange);
    const orientation = window.screen.orientation;
    orientation?.addEventListener("change", onChange);
    window.addEventListener("pointerup", onPointerUp, true);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      landscapeQuery.removeEventListener("change", onChange);
      window.removeEventListener("orientationchange", onChange);
      orientation?.removeEventListener("change", onChange);
      window.removeEventListener("pointerup", onPointerUp, true);
    };
  }, []);

  return null;
}
