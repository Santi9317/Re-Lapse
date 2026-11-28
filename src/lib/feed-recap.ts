const RECAP_KEY = "relapse.feedRecap";

export type RecapMoment = {
  mine: boolean;
  at: number;
  emoji?: string;
};

/** A frame the recap can count. `addedAt` is when it landed on the feed. */
export type RecapSource = {
  id: string;
  caption: string;
  image: string;
  name: string;
  emojis: [string, string, string];
  mine: boolean;
  addedAt: number;
  sortAt: number;
  notes: readonly RecapMoment[];
  reactions: readonly RecapMoment[];
};

export type RecapPhoto = {
  id: string;
  caption: string;
  image: string;
  name: string;
  emojis: [string, string, string];
  addedAt: number;
  sortAt: number;
  /** Emoji reactions that landed on this frame after the last look. */
  marks: string[];
};

export type RecapDeck = {
  photos: RecapPhoto[];
  notes: number;
  reactions: number;
};

function fresh(at: number, seenAt: number): boolean {
  return Number.isFinite(at) && at > seenAt;
}

/**
 * What landed after the last look.
 * A frame this camera took does not get a card. A note or reaction this
 * camera wrote does not count. The first look has no earlier visit, so
 * nothing is new. Photos run oldest first, then the wrap-up is separate.
 */
export function buildRecap(items: readonly RecapSource[], seenAt: number | null): RecapDeck | null {
  if (seenAt == null || !Number.isFinite(seenAt)) return null;
  const photos: RecapPhoto[] = [];
  let notes = 0;
  let reactions = 0;
  for (const item of items) {
    const marks: string[] = [];
    for (const note of item.notes) {
      if (!note.mine && fresh(note.at, seenAt)) notes += 1;
    }
    for (const reaction of item.reactions) {
      if (reaction.mine || !fresh(reaction.at, seenAt)) continue;
      reactions += 1;
      if (reaction.emoji) marks.push(reaction.emoji);
    }
    if (!item.mine && fresh(item.addedAt, seenAt)) {
      photos.push({
        id: item.id,
        caption: item.caption,
        image: item.image,
        name: item.name,
        emojis: item.emojis,
        addedAt: item.addedAt,
        sortAt: item.sortAt,
        marks,
      });
    }
  }
  photos.sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
  if (photos.length === 0 && notes === 0 && reactions === 0) return null;
  return { photos, notes, reactions };
}

export function recapTally(count: number, singular: string, plural: string): { count: number; label: string } {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return { count: n, label: n === 1 ? `new ${singular}` : `new ${plural}` };
}

/** The story the workshop shows when this visit has nothing new of its own. */
export function workshopSources(now: number): RecapSource[] {
  const hour = 60 * 60 * 1000;
  return [
    {
      id: "workshop-roof",
      caption: "The roof, after the flash.",
      image: "/recap/roof.png",
      name: "Mira",
      emojis: ["🌙", "✨", "🎞️"],
      mine: false,
      addedAt: now - 3 * hour,
      sortAt: now - 3 * hour,
      notes: [
        { mine: false, at: now - 2 * hour },
        { mine: false, at: now - 70 * 60 * 1000 },
      ],
      reactions: [
        { mine: false, at: now - 100 * 60 * 1000, emoji: "🌙" },
        { mine: false, at: now - 80 * 60 * 1000, emoji: "💛" },
      ],
    },
    {
      id: "workshop-table",
      caption: "Someone saved us a seat.",
      image: "/recap/table.png",
      name: "Jules",
      emojis: ["🌻", "📷", "💛"],
      mine: false,
      addedAt: now - hour,
      sortAt: now - hour,
      notes: [{ mine: false, at: now - 25 * 60 * 1000 }],
      reactions: [
        { mine: false, at: now - 20 * 60 * 1000, emoji: "🔥" },
        { mine: false, at: now - 12 * 60 * 1000, emoji: "👀" },
      ],
    },
    {
      id: "workshop-mine",
      caption: "This one stayed with you.",
      image: "/recap/roof.png",
      name: "You",
      emojis: ["✨", "✨", "✨"],
      mine: true,
      addedAt: now - 30 * 60 * 1000,
      sortAt: now - 30 * 60 * 1000,
      notes: [{ mine: true, at: now - 10 * 60 * 1000 }],
      reactions: [{ mine: true, at: now - 8 * 60 * 1000, emoji: "✨" }],
    },
  ];
}

export function workshopDeck(now: number): RecapDeck {
  const deck = buildRecap(workshopSources(now), now - 7 * 24 * 60 * 60 * 1000);
  if (!deck) return { photos: [], notes: 0, reactions: 0 };
  return deck;
}

/** Remember `?recap=1` for this tab, and `?recap=0` clears it. The feed itself stays put. */
export function captureRecapWorkshop(): void {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.get("recap") === "1") sessionStorage.setItem(RECAP_KEY, "1");
    if (query.get("recap") === "0") sessionStorage.removeItem(RECAP_KEY);
  } catch {
    /* session storage can be blocked */
  }
}

export function recapWorkshopStored(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(RECAP_KEY) === "1";
  } catch {
    return false;
  }
}

captureRecapWorkshop();
