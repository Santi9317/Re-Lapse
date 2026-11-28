"use client";

import { useEffect, useRef, useState } from "react";
import { deletePhoto, fetchFeed } from "@/lib/api";
import { pickWalk } from "@/lib/walkthrough";
import type { FeedItem, FrameComment, FrameSticker } from "@/lib/types";
import { PrintView } from "@/components/Print";
import { PullRefresh } from "@/components/PullRefresh";
import { useWalk, WalkMark, WalkTip } from "@/components/Walkthrough";

export function Feed({
  revision,
  refresh = 0,
  onOpenProfile,
  onSeen,
}: {
  revision: number;
  refresh?: number;
  onOpenProfile: (id: string) => void;
  onSeen?: (photos: FeedItem[]) => void;
}) {
  const [photos, setPhotos] = useState<FeedItem[]>([]);
  const [error, setError] = useState("");
  const removed = useRef(new Set<string>());
  const generation = useRef(0);
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let stop = false;
    async function load() {
      const ticket = ++generation.current;
      try {
        const feed = await fetchFeed();
        if (stop || ticket !== generation.current) return;
        const next = feed.photos.filter((photo) => !removed.current.has(photo.id));
        setPhotos(next);
        setError("");
        onSeenRef.current?.(next);
      } catch (err) {
        if (!stop && ticket === generation.current) setError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
    loadRef.current = load;
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [revision, refresh]);

  function onStickers(id: string, stickers: FrameSticker[]) {
    generation.current += 1;
    setPhotos((current) => current.map((photo) => (photo.id === id ? { ...photo, stickers } : photo)));
  }

  function onComments(id: string, comments: FrameComment[]) {
    generation.current += 1;
    setPhotos((current) => current.map((photo) => (photo.id === id ? { ...photo, comments } : photo)));
  }

  const feedWalk = useWalk("feed", true);
  const flipWalk = useWalk("flip", photos.length > 0);
  // Closing the feed tip does not start the frame tip in the same open.
  const feedTookThisOpen = useRef(false);
  if (feedWalk.visible) feedTookThisOpen.current = true;
  const picked = pickWalk({
    feed: feedWalk.visible,
    flip: flipWalk.visible && !feedTookThisOpen.current,
  });

  async function onDelete(id: string) {
    const previous = photos;
    removed.current.add(id);
    setPhotos((current) => current.filter((photo) => photo.id !== id));
    try {
      await deletePhoto(id);
    } catch (err) {
      removed.current.delete(id);
      setPhotos(previous);
      const message = err instanceof Error ? err.message : "That frame stayed put.";
      setError(message);
      throw err;
    }
  }

  return (
    <PullRefresh data-screen="feed" onRefresh={() => loadRef.current()}>
      {error ? <p className="error">{error}</p> : null}
      {picked === "feed" ? (
        <WalkTip id="feed" onDismiss={feedWalk.dismiss} onSkip={feedWalk.skip} onLater={feedWalk.later} />
      ) : null}
      {picked === "flip" ? (
        <WalkTip id="flip" onDismiss={flipWalk.dismiss} onSkip={flipWalk.skip} onLater={flipWalk.later} />
      ) : null}
      {picked === null && (feedWalk.mark || flipWalk.mark) ? (
        <div className="walk-marks">
          {feedWalk.mark ? <WalkMark id="feed" onOpen={feedWalk.revisit} /> : null}
          {flipWalk.mark ? <WalkMark id="flip" onOpen={flipWalk.revisit} /> : null}
        </div>
      ) : null}
      {photos.length === 0 ? (
        <div className="empty">
          <h2>Nothing back yet. 🌈</h2>
          <p>Develop a frame, then send the ones worth a <span className="namemark">Re-Lapse</span>. They stay up for a week.</p>
        </div>
      ) : (
        <div className="thread">
          {photos.map((photo) => (
            <PrintView
              key={photo.id}
              item={photo}
              onOpenProfile={onOpenProfile}
              onDelete={onDelete}
              onStickers={onStickers}
              onComments={onComments}
              noteSignal
            />
          ))}
        </div>
      )}
    </PullRefresh>
  );
}
