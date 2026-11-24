"use client";

import { useEffect, useRef, useState } from "react";
import { ago, leavesIn } from "@/lib/format";
import {
  ensurePhotoFile,
  fileFromImage,
  iosPhotosTarget,
  readyPhotoFile,
  shareOrSave,
  warmPhoto,
} from "@/lib/save";
import type { Album, FeedItem } from "@/lib/types";

function ProfileLink({ item, onOpenProfile }: { item: FeedItem; onOpenProfile?: (id: string) => void }) {
  if (!item.profileId || !item.profileName || !item.profileEmojis) return null;
  const marks = item.profileEmojis.join(" ");
  const inner = (
    <>
      {item.profileAvatar ? <img className="byline-avatar" src={`/api/profiles/${item.profileId}/avatar`} alt="" /> : null}
      <span className="byline-name">{item.profileName}</span>
      <span className="byline-marks">{marks}</span>
    </>
  );
  if (!onOpenProfile) return <p className="byline">{inner}</p>;
  return (
    <button
      className="byline"
      type="button"
      data-profile-id={item.profileId}
      aria-label={`Open ${item.profileName}'s profile`}
      onClick={() => onOpenProfile(item.profileId as string)}
    >
      {inner}
    </button>
  );
}

function place(item: FeedItem): string {
  return item.eventName || item.albumName || "";
}

function FrameActions({
  item,
  getImage,
  onDelete,
}: {
  item: FeedItem;
  getImage: () => HTMLImageElement | null;
  onDelete?: (id: string) => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    warmPhoto(item.id);
  }, [item.id]);

  function download() {
    setNote("");
    const file = readyPhotoFile(item.id) ?? fileFromImage(getImage());
    if (file) {
      const result = shareOrSave(file);
      if (result === "saved" && iosPhotosTarget()) {
        setNote("Saved as a file. On iPhone, choose Save Image to put it in Photos.");
      }
      return;
    }
    setSaving(true);
    void ensurePhotoFile(item.id)
      .then((next) => {
        const result = shareOrSave(next);
        if (result === "saved" && iosPhotosTarget()) {
          setNote("Saved as a file. On iPhone, choose Save Image to put it in Photos.");
        }
      })
      .catch(() => setNote("That frame didn't download."))
      .finally(() => setSaving(false));
  }

  async function confirmDelete() {
    if (!onDelete) return;
    setSaving(true);
    setNote("");
    try {
      await onDelete(item.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That frame stayed put.");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="print-actions">
      {confirming ? (
        <>
          <p className="meta">Gone for good.</p>
          <button type="button" disabled={saving} onClick={() => setConfirming(false)}>
            Keep
          </button>
          <button type="button" data-confirm-delete={item.id} disabled={saving} onClick={() => void confirmDelete()}>
            {saving ? "Deleting…" : "Delete"}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            data-download={item.id}
            aria-label={iosPhotosTarget() ? "Download this photo to Photos" : "Download this photo"}
            disabled={saving}
            onPointerDown={() => warmPhoto(item.id)}
            onClick={download}
          >
            {saving ? "Saving…" : "Download"}
          </button>
          {item.mine && onDelete ? (
            <button
              type="button"
              data-delete={item.id}
              aria-label="Delete this frame"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          ) : null}
        </>
      )}
      {note ? <p className="meta action-note">{note}</p> : null}
    </div>
  );
}

export function PrintView({
  item,
  albums,
  onFile,
  onOpen,
  onOpenProfile,
  onDelete,
  compact = false,
}: {
  item: FeedItem;
  albums?: Album[];
  onFile?: (id: string, albumId: string | null) => void;
  onOpen?: (item: FeedItem) => void;
  onOpenProfile?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
  compact?: boolean;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const where = place(item);
  const meta = [where, ago(item.createdAt), leavesIn(item.sortAt)].filter(Boolean).join(" · ");
  const image = (
    <img ref={imageRef} src={`/api/photos/${item.id}/image`} alt={item.caption || "Developed frame"} />
  );

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      warmPhoto(item.id);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) warmPhoto(item.id);
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.id]);

  return (
    <figure className="print" data-feed-photo={item.id} ref={rootRef}>
      {onOpen ? (
        <button className="frame" type="button" onClick={() => onOpen(item)} aria-label="Open frame">
          {image}
        </button>
      ) : (
        image
      )}
      {!compact && item.caption ? <figcaption className="caption">{item.caption}</figcaption> : null}
      {!compact ? <ProfileLink item={item} onOpenProfile={onOpenProfile} /> : null}
      <p className="meta">{meta}</p>
      {!compact ? <p className="stock-line">RE-LAPSE 400</p> : null}
      <FrameActions item={item} getImage={() => imageRef.current} onDelete={onDelete} />
      {onFile && item.mine && !item.eventId ? (
        <div className="file-row">
          {albums && albums.length > 0 ? (
            <select
              className="paper-select"
              aria-label="File this frame into a roll"
              value={item.albumId ?? ""}
              onChange={(event) => onFile(item.id, event.target.value || null)}
            >
              <option value="">Loose frame</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="meta">Make a roll to file this frame.</p>
          )}
        </div>
      ) : null}
    </figure>
  );
}

export function Lightbox({
  item,
  onClose,
  onOpenProfile,
  onDelete,
}: {
  item: FeedItem;
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const where = place(item);
  const meta = [where, ago(item.createdAt), leavesIn(item.sortAt)].filter(Boolean).join(" · ");
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.caption || "Frame"} onClick={onClose}>
      <figure className="print" onClick={(event) => event.stopPropagation()}>
        <img ref={imageRef} src={`/api/photos/${item.id}/image`} alt={item.caption || "Developed frame"} />
        {item.caption ? <figcaption className="caption">{item.caption}</figcaption> : null}
        <ProfileLink item={item} onOpenProfile={onOpenProfile} />
        <p className="meta">{meta}</p>
        <FrameActions item={item} getImage={() => imageRef.current} onDelete={onDelete} />
      </figure>
      <button className="ghost" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
