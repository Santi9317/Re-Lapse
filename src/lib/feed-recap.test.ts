import assert from "node:assert/strict";
import test from "node:test";
import { buildRecap, recapTally, workshopDeck, type RecapSource } from "./feed-recap.ts";

const hour = 60 * 60 * 1000;

function frame(patch: Partial<RecapSource> & Pick<RecapSource, "id" | "addedAt">): RecapSource {
  return {
    caption: patch.caption ?? "",
    image: patch.image ?? "",
    name: patch.name ?? "Cam",
    emojis: patch.emojis ?? ["✨", "✨", "✨"],
    mine: patch.mine ?? false,
    sortAt: patch.sortAt ?? patch.addedAt,
    notes: patch.notes ?? [],
    reactions: patch.reactions ?? [],
    ...patch,
  };
}

test("the first look has nothing to recap", () => {
  const deck = buildRecap([frame({ id: "a", addedAt: 50, mine: false })], null);
  assert.equal(deck, null);
});

test("a frame, note, or reaction from this camera does not count", () => {
  const seen = 100;
  const quiet = buildRecap(
    [
      frame({
        id: "mine",
        addedAt: 200,
        mine: true,
        notes: [{ mine: true, at: 220 }],
        reactions: [{ mine: true, at: 230, emoji: "💛" }],
      }),
      frame({ id: "old", addedAt: 40, mine: false, notes: [{ mine: false, at: 80 }] }),
    ],
    seen,
  );
  assert.equal(quiet, null);
});

test("new frames run oldest first, and notes and reactions add up across frames", () => {
  const deck = buildRecap(
    [
      frame({
        id: "later",
        addedAt: 300,
        caption: "Later",
        notes: [{ mine: false, at: 320 }],
        reactions: [{ mine: false, at: 310, emoji: "🔥" }],
      }),
      frame({
        id: "earlier",
        addedAt: 200,
        caption: "Earlier",
        notes: [
          { mine: false, at: 210 },
          { mine: true, at: 220 },
        ],
        reactions: [
          { mine: false, at: 205, emoji: "🌙" },
          { mine: false, at: 90, emoji: "👀" },
        ],
      }),
      frame({
        id: "mine",
        addedAt: 400,
        mine: true,
        notes: [{ mine: false, at: 410 }],
        reactions: [{ mine: false, at: 420, emoji: "💛" }],
      }),
    ],
    100,
  );
  assert.ok(deck);
  assert.deepEqual(
    deck.photos.map((photo) => photo.id),
    ["earlier", "later"],
  );
  assert.deepEqual(deck.photos[0]?.marks, ["🌙"]);
  assert.equal(deck.notes, 3);
  assert.equal(deck.reactions, 3);
});

test("notes and reactions alone still open a recap, with no photo cards", () => {
  const deck = buildRecap(
    [
      frame({
        id: "old",
        addedAt: 10,
        notes: [{ mine: false, at: 150 }],
        reactions: [{ mine: false, at: 160, emoji: "🔥" }],
      }),
    ],
    100,
  );
  assert.deepEqual(deck, { photos: [], notes: 1, reactions: 1 });
});

test("the tally is a count and a short label", () => {
  assert.deepEqual(recapTally(0, "note", "notes"), { count: 0, label: "new notes" });
  assert.deepEqual(recapTally(1, "note", "notes"), { count: 1, label: "new note" });
  assert.deepEqual(recapTally(4, "reaction", "reactions"), { count: 4, label: "new reactions" });
});

test("the workshop story is two new frames, three notes, and four reactions", () => {
  const now = 1_700_000_000_000;
  const deck = workshopDeck(now);
  assert.deepEqual(
    deck.photos.map((photo) => photo.id),
    ["workshop-roof", "workshop-table"],
  );
  assert.equal(deck.notes, 3);
  assert.equal(deck.reactions, 4);
  assert.ok(deck.photos[0] && deck.photos[0].addedAt < now - hour);
});
