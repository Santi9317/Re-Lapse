"use client";

import { useEffect, useRef, useState } from "react";
import { fetchFeed } from "@/lib/api";
import { FEED_SEEN_KEY, readFeedSeen } from "@/lib/feed-mark";
import {
  buildRecap,
  recapTally,
  workshopDeck,
  type RecapDeck,
  type RecapPhoto,
  type RecapSource,
} from "@/lib/feed-recap";
import { ago, leavesIn } from "@/lib/format";
import { PullRefresh } from "@/components/PullRefresh";
import { readStorage } from "@/lib/shell";
import type { FeedItem } from "@/lib/types";

const MARK_SLOTS: [number, number][] = [
  [14, 16],
  [78, 84],
  [18, 82],
  [72, 18],
];

function sourceFromFeed(photo: FeedItem): RecapSource {
  return {
    id: photo.id,
    caption: photo.caption,
    image: `/api/photos/${photo.id}/image`,
    name: photo.profileName ?? "",
    emojis: photo.profileEmojis ?? ["", "", ""],
    mine: photo.mine,
    addedAt: photo.addedAt,
    sortAt: photo.sortAt,
    notes: photo.comments.map((note) => ({ mine: note.mine, at: note.createdAt })),
    reactions: photo.stickers.map((sticker) => ({ mine: sticker.mine, at: sticker.pinnedAt, emoji: sticker.emoji })),
  };
}

function PhotoCard({ photo }: { photo: RecapPhoto }) {
  const marks = photo.emojis.filter(Boolean).join("");
  const meta = [ago(photo.addedAt), leavesIn(photo.sortAt)].filter(Boolean).join(" · ");
  return (
    <figure className="print recap-print" data-recap-photo={photo.id}>
      <div className="frame">
        <img src={photo.image} alt={photo.caption || "New frame"} draggable={false} />
        {photo.marks.length > 0 ? (
          <ul className="stickers" aria-hidden="true">
            {photo.marks.slice(0, MARK_SLOTS.length).map((emoji, index) => {
              const slot = MARK_SLOTS[index] ?? [14, 16];
              const tilt = (index % 2 === 0 ? -1 : 1) * (6 + index * 2);
              const place: { top: string; left: string; "--tilt": string } = {
                top: `${slot[0]}%`,
                left: `${slot[1]}%`,
                "--tilt": `${tilt}deg`,
              };
              return (
                <li
                  key={`${emoji}-${index}`}
                  className="sticker"
                  data-unseen="true"
                  data-inert="true"
                  style={place}
                >
                  {emoji}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {photo.caption ? <figcaption className="caption">{photo.caption}</figcaption> : null}
      {photo.name ? (
        <p className="byline">
          <span className="byline-name">{photo.name}</span>
          {marks ? <span className="byline-marks">{marks}</span> : null}
        </p>
      ) : null}
      {meta ? <p className="meta">{meta}</p> : null}
    </figure>
  );
}

function WrapCard({ notes, reactions }: { notes: number; reactions: number }) {
  const note = recapTally(notes, "note", "notes");
  const reaction = recapTally(reactions, "reaction", "reactions");
  return (
    <div className="recap-wrap" data-recap-wrap="true">
      <p className="kicker">Since you last looked</p>
      <h2>That&apos;s the lot.</h2>
      <ul className="recap-stats">
        <li>
          <span className="recap-num">{note.count}</span>
          <span className="recap-label">{note.label}</span>
        </li>
        <li>
          <span className="recap-num">{reaction.count}</span>
          <span className="recap-label">{reaction.label}</span>
        </li>
      </ul>
      <p className="fine">Notes on the back. Reactions on the front.</p>
    </div>
  );
}

export function FeedRecap({
  deck,
  source = "sample",
  onDismiss,
}: {
  deck: RecapDeck;
  source?: "sample" | "live";
  onDismiss: () => void;
}) {
  const steps = deck.photos.length + 1;
  const [index, setIndex] = useState(0);
  const [shift, setShift] = useState(0);
  const drag = useRef<{ id: number; x: number; y: number; dx: number; dy: number } | null>(null);
  const onWrap = index >= deck.photos.length;
  const photo = onWrap ? null : deck.photos[index];

  function go(dir: -1 | 1) {
    setShift(0);
    if (dir > 0 && index >= deck.photos.length) {
      onDismiss();
      return;
    }
    setIndex((current) => Math.max(0, Math.min(deck.photos.length, current + dir)));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    current.dx = event.clientX - current.x;
    current.dy = event.clientY - current.y;
    const limited = Math.max(-140, Math.min(140, current.dx));
    setShift(Math.abs(current.dx) > Math.abs(current.dy) ? limited : 0);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    const horizontal = Math.abs(current.dx) > 64 && Math.abs(current.dx) > Math.abs(current.dy);
    setShift(0);
    if (!horizontal) return;
    go(current.dx < 0 ? 1 : -1);
  }

  return (
    <section
      className="recap"
      data-screen="feed-recap"
      data-recap-step={onWrap ? "wrap" : "photo"}
      data-recap-source={source}
      aria-label="New since you last looked"
    >
      <div className="recap-head">
        <p className="kicker">{onWrap ? "Wrap-up" : "New frame"}</p>
        <p className="recap-step" aria-live="polite">
          {index + 1} of {steps}
        </p>
      </div>
      <div
        className="recap-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          key={index}
          className="recap-card"
          data-settle={shift === 0 ? "in" : "drag"}
          style={shift === 0 ? undefined : { transform: `translateX(${shift}px)` }}
        >
          {photo ? <PhotoCard photo={photo} /> : <WrapCard notes={deck.notes} reactions={deck.reactions} />}
        </div>
      </div>
      <p className="fine recap-hint">{onWrap ? "This opens the feed." : "Swipe for the next one."}</p>
      <button
        className="primary"
        type="button"
        data-recap-next={onWrap ? undefined : "true"}
        data-recap-dismiss={onWrap ? "true" : undefined}
        onClick={() => go(1)}
      >
        {onWrap ? "Open the feed" : "Next"}
      </button>
    </section>
  );
}

/** In front of the feed while `?recap=1` is on. A quiet visit uses the sample story. */
export function FeedRecapWorkshop({ onDismiss }: { onDismiss: () => void }) {
  const [deck, setDeck] = useState<RecapDeck>(() => workshopDeck(Date.now()));
  const [source, setSource] = useState<"sample" | "live">("sample");
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const feed = await fetchFeed();
        if (stop) return;
        const seenAt = readFeedSeen(readStorage(localStorage, FEED_SEEN_KEY));
        const live = buildRecap(feed.photos.map(sourceFromFeed), seenAt);
        if (!live) return;
        setDeck(live);
        setSource("live");
      } catch {
        /* a quiet visit keeps the sample story */
      }
    }
    loadRef.current = load;
    void load();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <PullRefresh scroll={false} onRefresh={() => loadRef.current()}>
      <FeedRecap key={source} deck={deck} source={source} onDismiss={() => onDismissRef.current()} />
    </PullRefresh>
  );
}

/** The real Feed. New frames open the recap. A quiet visit goes straight to the list. */
export function FeedRecapLive({ onDismiss }: { onDismiss: () => void }) {
  const [deck, setDeck] = useState<RecapDeck | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const feed = await fetchFeed();
        if (stop) return;
        const seenAt = readFeedSeen(readStorage(localStorage, FEED_SEEN_KEY));
        const live = buildRecap(feed.photos.map(sourceFromFeed), seenAt);
        if (!live) {
          onDismissRef.current();
          return;
        }
        setDeck(live);
      } catch {
        if (!stop) onDismissRef.current();
      }
    }
    loadRef.current = load;
    void load();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <PullRefresh scroll={false} onRefresh={() => loadRef.current()} data-screen="feed-recap">
      {deck ? <FeedRecap deck={deck} source="live" onDismiss={() => onDismissRef.current()} /> : null}
    </PullRefresh>
  );
}
