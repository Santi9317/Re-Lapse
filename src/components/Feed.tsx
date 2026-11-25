"use client";

import { useEffect, useRef, useState } from "react";
import { deletePhoto, fetchFeed } from "@/lib/api";
import type { FeedItem, FrameSticker } from "@/lib/types";
import { Lightbox, PrintView } from "@/components/Print";

export function Feed({
  revision,
  refresh = 0,
  onOpenProfile,
}: {
  revision: number;
  refresh?: number;
  onOpenProfile: (id: string) => void;
}) {
  const [photos, setPhotos] = useState<FeedItem[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<FeedItem | null>(null);
  const removed = useRef(new Set<string>());
  const generation = useRef(0);

  useEffect(() => {
    let stop = false;
    async function load() {
      const ticket = ++generation.current;
      try {
        const feed = await fetchFeed();
        if (stop || ticket !== generation.current) return;
        const next = feed.photos.filter((photo) => !removed.current.has(photo.id));
        setPhotos(next);
        setOpen((current) => {
          if (!current || removed.current.has(current.id)) return null;
          return next.find((photo) => photo.id === current.id) ?? null;
        });
        setError("");
      } catch (err) {
        if (!stop && ticket === generation.current) setError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
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
    setOpen((current) => (current && current.id === id ? { ...current, stickers } : current));
  }

  async function onDelete(id: string) {
    const previous = photos;
    const opened = open;
    removed.current.add(id);
    setPhotos((current) => current.filter((photo) => photo.id !== id));
    if (open?.id === id) setOpen(null);
    try {
      await deletePhoto(id);
    } catch (err) {
      removed.current.delete(id);
      setPhotos(previous);
      setOpen(opened);
      const message = err instanceof Error ? err.message : "That frame stayed put.";
      setError(message);
      throw err;
    }
  }

  return (
    <div className="scroll" data-screen="feed">
      {error ? <p className="error">{error}</p> : null}
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
              onOpen={setOpen}
              onOpenProfile={onOpenProfile}
              onDelete={onDelete}
              onStickers={onStickers}
            />
          ))}
        </div>
      )}
      {open ? (
        <Lightbox
          item={open}
          onClose={() => setOpen(null)}
          onOpenProfile={onOpenProfile}
          onDelete={onDelete}
          onStickers={onStickers}
        />
      ) : null}
    </div>
  );
}
