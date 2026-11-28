import type { LabState } from "./types";

/**
 * The lab home is one display of how many photos are ready, not a list of cards.
 * Darkroom keeps the list: photos still waiting, photos ready to develop, and
 * prints already developed, so each one can still be handled on its own.
 */
export function labScreenShows(state: LabState, screen: "select" | "darkroom"): boolean {
  if (screen === "select") return false;
  return state === "developing" || state === "sealed" || state === "ready" || state === "developed";
}

export function readyLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 ready" : `${n} ready`;
}
