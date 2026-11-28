/**
 * Three first-use tips, each in the place it belongs.
 * Got it and Skip keep that tip quiet. Later brings it back the next time
 * the place opens. The tip button on that place opens it again.
 * This is not a tour. The menu's How To stays the written recap.
 */

export const WALK_KEY = "relapse.walkthrough";

export const WALK_IDS = ["flip", "feed", "lab"] as const;

export type WalkId = (typeof WALK_IDS)[number];

export type WalkStatus = "new" | "dismissed" | "skipped" | "later";

export type WalkAction = "dismiss" | "skip" | "later";

export type WalkBook = Record<WalkId, WalkStatus>;

export type WalkTip = {
  id: WalkId;
  kicker: string;
  line: string;
};

export const WALK_TIPS: readonly WalkTip[] = [
  { id: "flip", kicker: "Notes", line: "Tap the frame. The notes are on the back." },
  { id: "feed", kicker: "Feed", line: "Frames from this link show up here." },
  { id: "lab", kicker: "This print", line: "Download keeps it. Delete throws it out." },
];

export const WALK_AGAIN: Record<WalkId, string> = {
  flip: "Notes tip",
  feed: "Feed tip",
  lab: "Print tip",
};

const STATUSES = new Set<WalkStatus>(["new", "dismissed", "skipped", "later"]);

export function freshWalkBook(): WalkBook {
  return { flip: "new", feed: "new", lab: "new" };
}

export function readWalkBook(raw: string | null): WalkBook {
  const book = freshWalkBook();
  if (raw == null || raw.trim() === "") return book;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return book;
  }
  if (!parsed || typeof parsed !== "object") return book;
  const record = parsed as Record<string, unknown>;
  for (const id of WALK_IDS) {
    const value = record[id];
    if (typeof value === "string" && STATUSES.has(value as WalkStatus)) book[id] = value as WalkStatus;
  }
  return book;
}

export function writeWalkBook(book: WalkBook): string {
  const stored: WalkBook = { flip: book.flip, feed: book.feed, lab: book.lab };
  return JSON.stringify(stored);
}

export function applyWalk(book: WalkBook, id: WalkId, action: WalkAction): WalkBook {
  const status: WalkStatus = action === "dismiss" ? "dismissed" : action === "skip" ? "skipped" : "later";
  return { ...book, [id]: status };
}

/** Read the saved book first, so closing one tip does not reopen another. */
export function commitWalk(raw: string | null, id: WalkId, action: WalkAction): WalkBook {
  return applyWalk(readWalkBook(raw), id, action);
}

/**
 * A new tip shows the first time its place is on screen.
 * Later shows again the next time that place opens, unless this open already chose Later.
 * Dismissed and skipped stay down until someone asks for the tip.
 */
export function walkVisible(input: {
  status: WalkStatus;
  placeOpen: boolean;
  held: boolean;
  asked: boolean;
}): boolean {
  if (!input.placeOpen) return false;
  if (input.asked) return true;
  if (input.held) return false;
  return input.status === "new" || input.status === "later";
}

/** The small control that brings a quiet tip back. It stays off while the tip is up, and off until the tip has been closed once. */
export function walkMarkVisible(input: { status: WalkStatus; placeOpen: boolean; tipOpen: boolean }): boolean {
  if (!input.placeOpen || input.tipOpen) return false;
  return input.status !== "new";
}

/** One tip at a time. On the feed, the place comes before the frame sitting on it. */
export function pickWalk(open: Partial<Record<WalkId, boolean>>): WalkId | null {
  if (open.feed) return "feed";
  if (open.flip) return "flip";
  if (open.lab) return "lab";
  return null;
}
