"use client";

import { ago } from "@/lib/format";
import type { Profile } from "@/lib/profile";
import type { Album, FeedItem } from "@/lib/types";

function Signature({ signature }: { signature?: Pick<Profile, "username" | "emojis"> | null }) {
  if (!signature) return null;
  return (
    <p className="byline">
      <span className="byline-name">{signature.username}</span>
      <span className="byline-marks">{signature.emojis.join(" ")}</span>
    </p>
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
  compact = false,
  signature = null,
}: {
  item: FeedItem;
  albums?: Album[];
  onFile?: (id: string, albumId: string | null) => void;
  onOpen?: (item: FeedItem) => void;
  compact?: boolean;
  signature?: Pick<Profile, "username" | "emojis"> | null;
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
      {!compact && item.mine ? <Signature signature={signature} /> : null}
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
  signature = null,
}: {
  item: FeedItem;
  onClose: () => void;
  signature?: Pick<Profile, "username" | "emojis"> | null;
}) {
  const where = place(item);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.caption || "Frame"} onClick={onClose}>
      <figure className="print" onClick={(event) => event.stopPropagation()}>
        <img src={`/api/photos/${item.id}/image`} alt={item.caption || "Developed frame"} />
        {item.caption ? <figcaption className="caption">{item.caption}</figcaption> : null}
        {item.mine ? <Signature signature={signature} /> : null}
        <p className="meta">{where ? `${where} · ${ago(item.createdAt)}` : ago(item.createdAt)}</p>
      </figure>
      <button className="ghost" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
