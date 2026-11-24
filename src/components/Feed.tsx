"use client";

import { useEffect, useRef, useState } from "react";
import { deletePhoto, fetchAlbums, fetchFeed, filePhoto } from "@/lib/api";
import type { Album, FeedItem } from "@/lib/types";
import { Lightbox, PrintView } from "@/components/Print";

export function Feed({ revision }: { revision: number }) {
  const [photos, setPhotos] = useState<FeedItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<FeedItem | null>(null);
  const removed = useRef(new Set<string>());

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [feed, rolls] = await Promise.all([fetchFeed(), fetchAlbums()]);
        if (stop) return;
        setPhotos(feed.photos.filter((photo) => !removed.current.has(photo.id)));
        setOpen((current) =>
          current && feed.photos.some((photo) => photo.id === current.id) && !removed.current.has(current.id)
            ? current
            : null,
        );
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
          <h2>Nothing back from the lab.</h2>
          <p>Develop a frame in the lab, then send it if you want it here. It stays up for a week.</p>
        </div>
      ) : (
        <div className="thread">
          {photos.map((photo) => (
            <PrintView key={photo.id} item={photo} albums={albums} onFile={onFile} onOpen={setOpen} onDelete={onDelete} />
          ))}
        </div>
      )}
      {open ? <Lightbox item={open} onClose={() => setOpen(null)} onDelete={onDelete} /> : null}
    </div>
  );
}
