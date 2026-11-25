"use client";

import { useEffect, useState } from "react";
import { deleteAlbum, deletePhoto, fetchAlbum, filePhoto, updateAlbum } from "@/lib/api";
import { frames } from "@/lib/format";
import type { AlbumDetail, FeedItem, GalleryCard } from "@/lib/types";
import { PhotoStrip, StripShot } from "@/components/PhotoStrip";
import { Lightbox, PrintView } from "@/components/Print";

function Cover({ id }: { id: string | null }) {
  const [dead, setDead] = useState(false);
  if (!id || dead) return <span className="gallery-cover empty">No cover</span>;
  return <img className="gallery-cover" src={`/api/photos/${id}/image`} alt="" onError={() => setDead(true)} />;
}

export function GalleryCardButton({ gallery, onOpen }: { gallery: GalleryCard; onOpen: () => void }) {
  return (
    <button className="gallery-card" type="button" data-gallery={gallery.id} onClick={onOpen}>
      <Cover key={gallery.coverPhotoId ?? "none"} id={gallery.coverPhotoId} />
      <span className="gallery-copy">
        <h3>{gallery.name}</h3>
        <p>{frames(gallery.frameCount)}</p>
      </span>
    </button>
  );
}

export function GalleryStrip({
  galleries,
  empty,
  onOpen,
}: {
  galleries: GalleryCard[];
  empty: string;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <h2 className="section">Galleries</h2>
      {galleries.length === 0 ? (
        <div className="empty">
          <h2>No galleries yet.</h2>
          <p>{empty}</p>
        </div>
      ) : (
        galleries.map((gallery) => (
          <GalleryCardButton key={gallery.id} gallery={gallery} onOpen={() => onOpen(gallery.id)} />
        ))
      )}
    </>
  );
}

export function Gallery({
  id,
  onBack,
  backLabel = "Keepsakes",
  onOpenProfile,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  backLabel?: string;
  onOpenProfile?: (id: string) => void;
  onChanged?: () => void;
}) {
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!confirming) return;
    const node = document.querySelector("[data-confirm-delete-gallery]");
    const scroller = node?.closest(".scroll");
    if (!(node instanceof HTMLElement) || !(scroller instanceof HTMLElement)) return;
    const navTop = document.querySelector(".nav")?.getBoundingClientRect().top ?? scroller.getBoundingClientRect().bottom;
    const overflow = node.getBoundingClientRect().bottom - (navTop - 12);
    if (overflow > 0) scroller.scrollTop += overflow;
  }, [confirming]);

  useEffect(() => {
    let stop = false;
    setError("");
    fetchAlbum(id)
      .then((next) => {
        if (stop) return;
        setDetail(next);
        setTitle(next.album.name);
        setOpen((current) => (current ? next.photos.find((photo) => photo.id === current.id) ?? null : null));
      })
      .catch((err: unknown) => {
        if (!stop) setError(err instanceof Error ? err.message : "That gallery is gone.");
      });
    return () => {
      stop = true;
    };
  }, [id, tick]);

  function reload() {
    onChanged?.();
    setTick((value) => value + 1);
  }

  async function rename() {
    const name = title.trim();
    if (!detail || !name || name === detail.album.name || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateAlbum(detail.album.id, { name });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That title stayed put.");
    } finally {
      setBusy(false);
    }
  }

  async function setCover(photoId: string) {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateAlbum(detail.album.id, { coverPhotoId: photoId });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That cover stayed put.");
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(photoId: string) {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      await filePhoto(photoId, detail.album.id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That photo stayed out.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(photoId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await filePhoto(photoId, null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That photo stayed in.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(photoId: string) {
    try {
      await deletePhoto(photoId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame stayed put.");
      throw err;
    }
  }

  async function destroy() {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteAlbum(detail.album.id);
      onChanged?.();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That gallery stayed put.");
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="scroll" data-screen="gallery">
        <button className="ghost back" type="button" onClick={onBack}>
          ← {backLabel}
        </button>
        {error ? <p className="error">{error}</p> : <p className="fine">Opening the gallery.</p>}
      </div>
    );
  }

  const owner = detail.album.owner;
  const inGallery = new Set(detail.photos.map((photo) => photo.id));
  const available = detail.library.filter((photo) => !inGallery.has(photo.id));
  const coverId = detail.album.coverPhotoId;

  return (
    <div className="scroll" data-screen="gallery" data-owner={owner ? "yes" : "no"}>
      <button className="ghost back" type="button" onClick={onBack}>
        ← {backLabel}
      </button>
      {owner ? (
        <>
          <label className="fine gallery-label" htmlFor="gallery-title">
            Album title
          </label>
          <div className="row">
            <input
              id="gallery-title"
              className="field"
              maxLength={40}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void rename();
              }}
            />
            <button
              className="primary"
              type="button"
              disabled={busy || !title.trim() || title.trim() === detail.album.name}
              onClick={() => void rename()}
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <h2 className="word" style={{ fontSize: 36 }}>{detail.album.name}</h2>
      )}
      <p className="fine">{frames(detail.album.frameCount)}</p>
      {error ? <p className="error">{error}</p> : null}
      {detail.photos.length === 0 ? (
        <div className="empty">
          <h2>Empty gallery.</h2>
          <p>{owner ? "Add a photo you already sent to the feed." : "Nothing in this gallery yet."}</p>
        </div>
      ) : owner ? (
        <PhotoStrip name="members" label="Photos in this gallery">
          {detail.photos.map((photo) => {
            const caption = photo.caption.trim();
            return (
              <div className="photo-strip-card" role="listitem" key={photo.id} data-gallery-photo={photo.id}>
                <StripShot
                  id={photo.id}
                  label={caption ? `Open ${caption}` : "Open photo"}
                  onOpen={() => setOpen(photo)}
                />
                {caption ? <span className="photo-strip-caption">{caption}</span> : null}
                {photo.id === coverId ? (
                  <span className="cover-pill">Cover</span>
                ) : (
                  <button className="ghost" type="button" data-set-cover={photo.id} disabled={busy} onClick={() => void setCover(photo.id)}>
                    Set cover
                  </button>
                )}
                <button className="ghost" type="button" data-remove-photo={photo.id} disabled={busy} onClick={() => void removePhoto(photo.id)}>
                  Remove
                </button>
              </div>
            );
          })}
        </PhotoStrip>
      ) : (
        <div className="thread">
          {detail.photos.map((photo) => (
            <div className="gallery-frame" key={photo.id} data-gallery-photo={photo.id}>
              <PrintView item={photo} onOpen={setOpen} onOpenProfile={onOpenProfile} />
            </div>
          ))}
        </div>
      )}
      {owner ? (
        <>
          <h2 className="section">Your photos</h2>
          {detail.library.length === 0 ? (
            <div className="empty">
              <h2>Nothing to add.</h2>
              <p>Send a photo to the feed, then add it here.</p>
            </div>
          ) : available.length === 0 ? (
            <p className="fine">Every photo you sent is already in this gallery.</p>
          ) : (
            <PhotoStrip name="library" label="Your photos">
              {available.map((photo) => {
                const caption = photo.caption.trim();
                return (
                  <div className="photo-strip-card" role="listitem" key={photo.id} data-library-photo={photo.id}>
                    <StripShot
                      id={photo.id}
                      label={caption ? `Open ${caption}` : "Open photo"}
                      onOpen={() => setOpen(photo)}
                    />
                    {caption ? <span className="photo-strip-caption">{caption}</span> : null}
                    <button className="ghost" type="button" data-add-photo={photo.id} disabled={busy} onClick={() => void addPhoto(photo.id)}>
                      Add
                    </button>
                    {photo.albumName ? <span className="fine">In {photo.albumName}</span> : null}
                  </div>
                );
              })}
            </PhotoStrip>
          )}
          {confirming ? (
            <div className="empty gallery-confirm" data-confirm-delete-gallery>
              <h2>Delete this gallery?</h2>
              <p>The photos stay on your camera roll and the thread.</p>
              <div className="stack">
                <button className="primary" type="button" data-confirm-delete-gallery disabled={busy} onClick={() => void destroy()}>
                  {busy ? "Deleting…" : "Delete it"}
                </button>
                <button className="ghost" type="button" disabled={busy} onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button className="ghost" type="button" data-delete-gallery disabled={busy} onClick={() => setConfirming(true)}>
              Delete gallery
            </button>
          )}
        </>
      ) : null}
      {open ? (
        <Lightbox item={open} onClose={() => setOpen(null)} onOpenProfile={onOpenProfile} onDelete={owner ? onDelete : undefined} />
      ) : null}
    </div>
  );
}
