/** One line on the back of a frame. */
export const FRAME_NOTE_LIMIT = 80;

/** A signed note keeps one of these handwriting faces. */
export const NOTE_HANDS = ["caveat", "patrick", "kalam"] as const;

export type NoteHand = (typeof NOTE_HANDS)[number];

export function noteHand(value: unknown): NoteHand {
  return NOTE_HANDS.find((hand) => hand === value) ?? "caveat";
}

/** Picked once, when the note is signed, so the face stays put. */
export function pickNoteHand(): NoteHand {
  const index = Math.floor(Math.random() * NOTE_HANDS.length);
  return NOTE_HANDS[index] ?? "caveat";
}
