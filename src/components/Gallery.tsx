"use client";

import { useEffect, useRef, useState } from "react";
import { deleteAlbum, deletePhoto, fetchAlbum, filePhoto, updateAlbum } from "@/lib/api";
import { frames } from "@/lib/format";
import { galleryTitleSave, galleryView, type GalleryPlace } from "@/lib/gallery-view";
import type { AlbumDetail, FeedItem, FrameComment, GalleryCard, GalleryRoll } from "@/lib/types";
import { PhotoStrip, StripShot } from "@/components/PhotoStrip";
import { Lightbox, PrintView } from "@/components/Print";
import { PullRefresh } from "@/components/PullRefresh";

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
        <div className="gallery-grid">
          {galleries.map((gallery) => (
            <GalleryCardButton key={gallery.id} gallery={gallery} onOpen={() => onOpen(gallery.id)} />
          ))}
        </div>
      )}
    </>
  );
}

export function Gallery({
  id,
  refresh = 0,
  place,
  onBack,
  backLabel = "Keepsakes",
  onOpenProfile,
  onChanged,
  onShoot,
}: {
  id: string;
  refresh?: number;
  place: GalleryPlace;
  onBack: () => void;
  backLabel?: string;
  onOpenProfile?: (id: string) => void;
  onChanged?: () => void;
  onShoot?: (gallery: GalleryRoll) => void;
}) {
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});

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
    async function load() {
      setError("");
      try {
        const next = await fetchAlbum(id);
        if (stop) return;
        setDetail(next);
        setTitle(next.album.name);
        setOpen((current) => {
          if (!current) return null;
          return (
            next.photos.find((photo) => photo.id === current.id) ??
            next.library.find((photo) => photo.id === current.id) ??
            null
          );
        });
      } catch (err: unknown) {
        if (!stop) setError(err instanceof Error ? err.message : "That gallery is gone.");
      }
    }
    loadRef.current = load;
    void load();
    return () => {
      stop = true;
    };
  }, [id, tick, refresh]);

  function reload() {
    onChanged?.();
    setTick((value) => value + 1);
  }

  function onPhotoNotes(id: string, comments: FrameComment[]) {
    setDetail((current) => {
      if (!current) return current;
      const apply = (photo: FeedItem) => (photo.id === id ? { ...photo, comments } : photo);
      return { ...current, photos: current.photos.map(apply), library: current.library.map(apply) };
    });
    setOpen((current) => (current?.id === id ? { ...current, comments } : current));
  }

  async function saveGallery() {
    if (!detail || busy) return;
    const plan = galleryTitleSave(title, detail.album.name);
    if (plan.status === "stay") {
      setError(plan.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (plan.status === "write") await updateAlbum(detail.album.id, { name: plan.name });
      onChanged?.();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That title stayed put.");
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
      <PullRefresh data-screen="gallery" data-place={place} onRefresh={() => loadRef.current()}>
        <button className="ghost back" type="button" onClick={onBack}>
          ← {backLabel}
        </button>
        {error ? <p className="error">{error}</p> : <p className="fine">Opening the gallery.</p>}
      </PullRefresh>
    );
  }

  const owner = detail.album.owner;
  const view = galleryView({
    place,
    owner,
    albumId: detail.album.id,
    photos: detail.photos,
    library: detail.library,
  });
  const canEdit = view.editing;
  const available = view.addable;
  const coverId = detail.album.coverPhotoId;

  return (
    <PullRefresh
      data-screen="gallery"
      data-place={place}
      data-owner={owner ? "yes" : "no"}
      data-editing={canEdit ? "yes" : "no"}
      onRefresh={() => loadRef.current()}
    >
      <button className="ghost back" type="button" onClick={onBack}>
        ← {backLabel}
      </button>
      {canEdit ? (
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
                if (event.key === "Enter") void saveGallery();
              }}
            />
            <button
              className="primary"
              type="button"
              data-save-gallery={detail.album.id}
              disabled={busy}
              onClick={() => void saveGallery()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      ) : (
        <h2 className="word" style={{ fontSize: 36 }}>{detail.album.name}</h2>
      )}
      <div className="gallery-meta">
        <p className="fine">{frames(detail.album.frameCount)}</p>
        {owner && onShoot ? (
          <button
            className="gallery-camera"
            type="button"
            data-shoot-gallery={detail.album.id}
            aria-label={`Shoot for ${detail.album.name}`}
            onClick={() => onShoot({ id: detail.album.id, name: detail.album.name })}
          >
            <span aria-hidden="true">📸</span>
            Shoot
          </button>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {view.photos.length === 0 ? (
        <div className="empty">
          <h2>Empty gallery.</h2>
          <p>{canEdit ? "Add a photo you already sent to the feed." : "Nothing in this gallery yet."}</p>
        </div>
      ) : canEdit ? (
        <PhotoStrip name="members" label="Photos in this gallery">
          {view.photos.map((photo) => {
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
          {view.photos.map((photo) => (
            <div className="gallery-frame" key={photo.id} data-gallery-photo={photo.id}>
              <PrintView
                item={photo}
                onOpenProfile={onOpenProfile}
                onComments={photo.mine ? onPhotoNotes : undefined}
                notes="owner"
              />
            </div>
          ))}
        </div>
      )}
      {canEdit ? (
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
        <Lightbox
          item={open}
          onClose={() => setOpen(null)}
          onOpenProfile={onOpenProfile}
          onDelete={canEdit ? onDelete : undefined}
          onComments={open.mine ? onPhotoNotes : undefined}
          notes="owner"
        />
      ) : null}
    </PullRefresh>
  );
}
