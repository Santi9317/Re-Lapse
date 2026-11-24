"use client";

import { useEffect, useState } from "react";
import { fetchAlbums, fetchFeed, filePhoto } from "@/lib/api";
import type { Album, FeedItem } from "@/lib/types";
import { Lightbox, PrintView } from "@/components/Print";

export function Feed({ revision, onOpenProfile }: { revision: number; onOpenProfile: (id: string) => void }) {
  const [photos, setPhotos] = useState<FeedItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<FeedItem | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [feed, rolls] = await Promise.all([fetchFeed(), fetchAlbums()]);
        if (stop) return;
        setPhotos(feed.photos);
        setAlbums(rolls);
        setError("");
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [revision]);

  async function onFile(id: string, albumId: string | null) {
    const previous = photos;
    const album = albums.find((item) => item.id === albumId) ?? null;
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, albumId, albumName: album?.name ?? null } : photo,
      ),
    );
    try {
      await filePhoto(id, albumId);
    } catch (err) {
      setPhotos(previous);
      setError(err instanceof Error ? err.message : "That frame can't be filed.");
    }
  }

  return (
    <div className="scroll" data-screen="feed">
      {error ? <p className="error">{error}</p> : null}
      {photos.length === 0 ? (
        <div className="empty">
          <h2>Nothing back from the lab.</h2>
          <p>Develop a frame in the lab, then send it if you want it here.</p>
        </div>
      ) : (
        <div className="thread">
          {photos.map((photo) => (
            <PrintView
              key={photo.id}
              item={photo}
              albums={albums}
              onFile={onFile}
              onOpen={setOpen}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      )}
      {open ? <Lightbox item={open} onClose={() => setOpen(null)} onOpenProfile={onOpenProfile} /> : null}
    </div>
  );
}
