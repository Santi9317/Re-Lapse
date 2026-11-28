import type { LabState } from "./types";

/**
 * The Lab opens on frames you can develop.
 * Darkroom keeps the ones still waiting, including a photo that was just taken.
 */
export function labScreenShows(state: LabState, screen: "select" | "darkroom"): boolean {
  if (screen === "darkroom") return state === "developing" || state === "sealed";
  return state === "ready" || state === "developed";
}
