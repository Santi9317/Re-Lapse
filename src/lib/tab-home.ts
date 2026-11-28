import type { MainTab } from "./refresh";

/** A tap on the tab that is already open asks that tab for its home screen. */
export function tabTapHomes(current: MainTab, tapped: MainTab): boolean {
  return current === tapped;
}

/** The Feed list jumps to the top when that same tap asks Feed for its home. */
export function feedHomeScroll(reducedMotion: boolean): { top: 0; behavior: "auto" | "smooth" } {
  return { top: 0, behavior: reducedMotion ? "auto" : "smooth" };
}
