"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fetchOwnProfile, saveOwnProfile, setFrameSticker } from "@/lib/api";
import { ago, leavesIn } from "@/lib/format";
import {
  EMOJI_GROUPS,
  NAME_LIMIT,
  STARTER_EMOJIS,
  emptyProfile,
  loadProfile,
  profileFromServer,
  profileReady,
  profileWrite,
  saveProfile,
  takeEmoji,
} from "@/lib/profile";
import {
  ensurePhotoFile,
  fileFromImage,
  iosPhotosTarget,
  readyPhotoFile,
  shareOrSave,
  warmPhoto,
} from "@/lib/save";
import type { Album, FeedItem, FrameSticker } from "@/lib/types";

const STICKER_SLOTS: [number, number][] = [
  [10, 12],
  [10, 88],
  [24, 8],
  [24, 92],
  [76, 10],
  [76, 90],
  [90, 20],
  [90, 80],
  [48, 8],
  [48, 92],
  [36, 14],
  [62, 86],
  [36, 86],
  [62, 14],
  [90, 50],
  [12, 50],
  [50, 22],
  [50, 78],
  [20, 30],
  [20, 70],
  [80, 30],
  [80, 70],
  [32, 50],
  [68, 50],
];

function stickerStyle(index: number): { top: string; left: string; "--tilt": string } {
  const slot = STICKER_SLOTS[index % STICKER_SLOTS.length] ?? [12, 12];
  const tilt = (index % 2 === 0 ? -1 : 1) * (6 + (index % 5) * 2);
  return { top: `${slot[0]}%`, left: `${slot[1]}%`, "--tilt": `${tilt}deg` };
}

function useFrameTap(onSingle: (() => void) | null, onDouble: (() => void) | null) {
  const single = useRef(onSingle);
  const double = useRef(onDouble);
  single.current = onSingle;
  double.current = onDouble;
  const wait = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (wait.current != null) window.clearTimeout(wait.current);
    },
    [],
  );
  return () => {
    if (!double.current) {
      single.current?.();
      return;
    }
    if (wait.current != null) {
      window.clearTimeout(wait.current);
      wait.current = null;
      double.current();
      return;
    }
    wait.current = window.setTimeout(() => {
      wait.current = null;
      single.current?.();
    }, 300);
  };
}

async function ensureStickerIdentity(typedName: string): Promise<void> {
  const remote = await fetchOwnProfile();
  if (remote) {
    saveProfile(profileFromServer(remote));
    return;
  }
  const local = loadProfile();
  const source = profileReady(local)
    ? local
    : { ...emptyProfile(), username: typedName.trim(), emojis: STARTER_EMOJIS };
  saveProfile(profileFromServer(await saveOwnProfile(profileWrite(source))));
}

function StickerLayer({
  item,
  onOpenProfile,
}: {
  item: FeedItem;
  onOpenProfile?: (id: string) => void;
}) {
  if (item.stickers.length === 0) return null;
  return (
    <ul className="stickers" aria-label="Stickers on this frame">
      {item.stickers.map((sticker, index) => {
        const style = stickerStyle(index);
        const label = `${sticker.profileName} stuck ${sticker.emoji}`;
        const linked = item.mine && Boolean(onOpenProfile);
        if (!linked) {
          return (
            <li key={sticker.profileId}>
              <span
                className="sticker"
                style={style}
                data-sticker={sticker.emoji}
                data-profile-id={sticker.profileId}
                data-mine={sticker.mine ? "true" : "false"}
                data-inert="true"
                role="img"
                aria-label={label}
                title={sticker.profileName}
              >
                {sticker.emoji}
              </span>
            </li>
          );
        }
        return (
          <li key={sticker.profileId}>
            <button
              className="sticker"
              style={style}
              type="button"
              data-sticker={sticker.emoji}
              data-profile-id={sticker.profileId}
              data-sticker-link="profile"
              data-mine={sticker.mine ? "true" : "false"}
              title={sticker.profileName}
              aria-label={`Open ${sticker.profileName}'s profile`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenProfile?.(sticker.profileId);
              }}
            >
              {sticker.emoji}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StickerPicker({
  photoId,
  mineEmoji,
  onClose,
  onPlaced,
}: {
  photoId: string;
  mineEmoji: string;
  onClose: () => void;
  onPlaced: (stickers: FrameSticker[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(() => loadProfile().username);
  const [needsName, setNeedsName] = useState(() => !profileReady(loadProfile()));
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameId = `sticker-name-${photoId}`;

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    let stop = false;
    fetchOwnProfile()
      .then((remote) => {
        if (stop || !remote) return;
        saveProfile(profileFromServer(remote));
        setNeedsName(false);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function place(emoji: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await ensureStickerIdentity(name);
      const result = await setFrameSticker(photoId, emoji);
      onPlaced(result.stickers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That sticker didn't stick.");
      setBusy(false);
    }
  }

  return (
    <div
      className="sticker-picker"
      role="dialog"
      aria-label="Stick an emoji"
      data-sticker-picker={photoId}
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="kicker">Stick an emoji</p>
      <p className="fine">
        {mineEmoji ? `Yours is ${mineEmoji}. Pick again to change it.` : "One sticker each. It stays on the frame."}
      </p>
      {needsName ? (
        <>
          <label className="fine" htmlFor={nameId}>
            Your name
          </label>
          <input
            id={nameId}
            className="field"
            value={name}
            maxLength={NAME_LIMIT}
            autoComplete="nickname"
            placeholder="What the frame should call you"
            onChange={(event) => setName(event.target.value)}
          />
          <p className="fine">So the sticker has a person. Change the marks later on You.</p>
        </>
      ) : null}
      <label className="fine" htmlFor={`sticker-type-${photoId}`}>
        Or type one
      </label>
      <input
        id={`sticker-type-${photoId}`}
        className="field emoji-type"
        value={typed}
        maxLength={16}
        autoComplete="off"
        aria-label="Type an emoji"
        onChange={(event) => {
          const value = event.target.value;
          const emoji = takeEmoji(value);
          if (emoji) {
            setTyped("");
            void place(emoji);
            return;
          }
          setTyped(value.slice(0, 16));
          setError(value.trim() ? "That isn't an emoji." : "");
        }}
      />
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="kicker">{group.label}</p>
          <div className="emoji-grid">
            {group.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Stick ${emoji}`}
                aria-pressed={emoji === mineEmoji}
                disabled={busy}
                onClick={() => void place(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error ? <p className="error">{error}</p> : null}
      <button className="ghost" type="button" onClick={onClose} disabled={busy}>
        Close
      </button>
    </div>
  );
}

function FrameFace({
  item,
  imageRef,
  onOpen,
  onOpenProfile,
  onStickers,
}: {
  item: FeedItem;
  imageRef: RefObject<HTMLImageElement | null>;
  onOpen?: () => void;
  onOpenProfile?: (id: string) => void;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
}) {
  const [picker, setPicker] = useState(false);
  const reactable = Boolean(onStickers) && !item.mine;
  const tap = useFrameTap(onOpen ?? null, reactable ? () => setPicker(true) : null);
  const mineEmoji = item.stickers.find((sticker) => sticker.mine)?.emoji ?? "";
  const image = (
    <img ref={imageRef} src={`/api/photos/${item.id}/image`} alt={item.caption || "Developed frame"} />
  );
  const label = reactable
    ? onOpen
      ? "Open frame. Double tap to stick an emoji."
      : "Double tap to stick an emoji."
    : "Open frame";

  return (
    <>
      <div className="frame-stage">
        {onOpen || reactable ? (
          <button className="frame" type="button" onClick={tap} aria-label={label} data-frame={item.id}>
            {image}
          </button>
        ) : (
          image
        )}
        <StickerLayer item={item} onOpenProfile={onOpenProfile} />
      </div>
      {picker && onStickers ? (
        <StickerPicker
          photoId={item.id}
          mineEmoji={mineEmoji}
          onClose={() => setPicker(false)}
          onPlaced={(stickers) => {
            onStickers(item.id, stickers);
            setPicker(false);
          }}
        />
      ) : null}
    </>
  );
}

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
  onStickers,
  compact = false,
}: {
  item: FeedItem;
  albums?: Album[];
  onFile?: (id: string, albumId: string | null) => void;
  onOpen?: (item: FeedItem) => void;
  onOpenProfile?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
  compact?: boolean;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const where = place(item);
  const meta = [where, ago(item.createdAt), leavesIn(item.sortAt)].filter(Boolean).join(" · ");

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
      <FrameFace
        item={item}
        imageRef={imageRef}
        onOpen={onOpen ? () => onOpen(item) : undefined}
        onOpenProfile={onOpenProfile}
        onStickers={onStickers}
      />
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
  onStickers,
}: {
  item: FeedItem;
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const where = place(item);
  const meta = [where, ago(item.createdAt), leavesIn(item.sortAt)].filter(Boolean).join(" · ");
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.caption || "Frame"} onClick={onClose}>
      <figure className="print" onClick={(event) => event.stopPropagation()}>
        <FrameFace
          item={item}
          imageRef={imageRef}
          onOpenProfile={onOpenProfile}
          onStickers={onStickers}
        />
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
