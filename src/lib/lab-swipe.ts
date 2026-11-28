/** How far a print must travel before a swipe keeps or deletes it. */
export const SWIPE_COMMIT_PX = 84;

/** Frozen travel for the preview stills, past the commit line. */
export const SWIPE_POSE_PX = 156;

export type SwipeVerdict = "keep" | "delete";

export type SwipeUndo = {
  id: string;
  verdict: SwipeVerdict;
};

export type LabPose = "developing" | "ready" | "keep" | "delete" | "undo";

export function labPose(value: string | null | undefined): LabPose | null {
  if (value === "developing" || value === "ready" || value === "keep" || value === "delete" || value === "undo") {
    return value;
  }
  return null;
}

export function poseOffset(pose: "keep" | "delete"): number {
  return pose === "keep" ? SWIPE_POSE_PX : -SWIPE_POSE_PX;
}

/** Right keeps the print. Left deletes it. A short drag springs back. */
export function swipeVerdict(dx: number, commitPx = SWIPE_COMMIT_PX): SwipeVerdict | null {
  if (dx >= commitPx) return "keep";
  if (dx <= -commitPx) return "delete";
  return null;
}

/** The print turns as it travels. Degrees, signed with the drag. */
export function swipeTilt(dx: number, width: number): number {
  if (width <= 0) return 0;
  const tilt = (dx / width) * 22;
  return Math.max(-14, Math.min(14, tilt));
}

export function developingLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 developing" : `${n} developing`;
}

/**
 * Undo lives only while the lab tab stays open.
 * Leaving the tab drops it. The swipe already landed.
 */
export function undoAfterTabChange(undo: SwipeUndo | null, tab: string): SwipeUndo | null {
  return tab === "lab" ? undo : null;
}

export type SwipeFrame = { id: string };

export function commitSwipe<T extends SwipeFrame>(
  deck: readonly T[],
  verdict: SwipeVerdict,
): { deck: T[]; undo: SwipeUndo; frame: T } | null {
  const [frame, ...rest] = deck;
  if (!frame) return null;
  return { deck: rest, undo: { id: frame.id, verdict }, frame };
}

/** Put the swiped print back on top. A mismatched undo leaves the deck alone. */
export function restoreSwipe<T extends SwipeFrame>(deck: readonly T[], frame: T, undo: SwipeUndo | null): T[] {
  if (!undo || undo.id !== frame.id) return [...deck];
  return [frame, ...deck.filter((row) => row.id !== frame.id)];
}
