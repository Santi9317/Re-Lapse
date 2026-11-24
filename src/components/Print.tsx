"use client";

import { ago } from "@/lib/format";
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

export function PrintView({
  item,
  albums,
  onFile,
  onOpen,
  onOpenProfile,
  compact = false,
}: {
  item: FeedItem;
  albums?: Album[];
  onFile?: (id: string, albumId: string | null) => void;
  onOpen?: (item: FeedItem) => void;
  onOpenProfile?: (id: string) => void;
  compact?: boolean;
}) {
  const where = place(item);
  const meta = where ? `${where} · ${ago(item.createdAt)}` : ago(item.createdAt);
  const image = (
    <img src={`/api/photos/${item.id}/image`} alt={item.caption || "Developed frame"} />
  );
  return (
    <figure className="print" data-feed-photo={item.id}>
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
      {!compact ? <p className="stock-line">RELAPSE 400</p> : null}
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
}: {
  item: FeedItem;
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
}) {
  const where = place(item);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.caption || "Frame"} onClick={onClose}>
      <figure className="print" onClick={(event) => event.stopPropagation()}>
        <img src={`/api/photos/${item.id}/image`} alt={item.caption || "Developed frame"} />
        {item.caption ? <figcaption className="caption">{item.caption}</figcaption> : null}
        <ProfileLink item={item} onOpenProfile={onOpenProfile} />
        <p className="meta">{where ? `${where} · ${ago(item.createdAt)}` : ago(item.createdAt)}</p>
      </figure>
      <button className="ghost" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
