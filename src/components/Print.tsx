"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { fetchOwnProfile, fetchPublicProfile, isProfileRemoved, moveFrameSticker, removeFrameNote, removeFrameSticker, saveOwnProfile, setFrameNote, setFrameSticker } from "@/lib/api";
import { CaptionField } from "@/components/CaptionField";
import { FRAME_NOTE_LIMIT, photoBackOpens } from "@/lib/frame-note";
import { ago, leavesIn } from "@/lib/format";
import {
  EMOJI_CHOICES,
  NAME_LIMIT,
  STARTER_EMOJIS,
  emptyProfile,
  loadProfile,
  profileFromServer,
  profileReady,
  profileWrite,
  saveProfile,
  takeEmoji,
  withCameraPortrait,
} from "@/lib/profile";
import { pickQuickStickers } from "@/lib/quick-stickers";
import { frameHasUnseenNote, noteNotesViewed } from "@/lib/note-seen";
import { noteStickerViewed, stickerUnseen } from "@/lib/sticker-seen";
import { canMoveSticker, clampStickerPoint, stickerTilt } from "@/lib/sticker-place";
import {
  ensurePhotoFile,
  fileFromImage,
  iosPhotosTarget,
  readyPhotoFile,
  shareOrSave,
  warmPhoto,
} from "@/lib/save";
import type { FeedItem, FrameComment, FrameSticker, SharedProfile } from "@/lib/types";

function stickerStyle(spot: { x: number; y: number }, index: number): { top: string; left: string; "--tilt": string } {
  return { top: `${spot.y}%`, left: `${spot.x}%`, "--tilt": `${stickerTilt(index)}deg` };
}

const DRAG_SLOP = 8;

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

async function ensureStickerIdentity(typedName: string, naming: boolean): Promise<void> {
  let remote: Awaited<ReturnType<typeof fetchOwnProfile>> = null;
  try {
    remote = await fetchOwnProfile();
  } catch (err) {
    if (!isProfileRemoved(err) || !naming) throw err;
    const source = { ...emptyProfile(), username: typedName.trim(), emojis: STARTER_EMOJIS };
    saveProfile(profileFromServer(await saveOwnProfile(profileWrite(source), { replaceRemoved: true })));
    return;
  }
  if (remote) {
    const next = withCameraPortrait(profileFromServer(remote), loadProfile());
    if (profileReady(next)) saveProfile(next);
    return;
  }
  const local = loadProfile();
  const source = profileReady(local)
    ? local
    : { ...emptyProfile(), username: typedName.trim(), emojis: STARTER_EMOJIS };
  saveProfile(profileFromServer(await saveOwnProfile(profileWrite(source))));
}

type Drag = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  moved: boolean;
};

function StickerLayer({
  item,
  shown,
  onPreview,
  onMove,
}: {
  item: FeedItem;
  shown: boolean;
  onPreview: (sticker: FrameSticker) => void;
  onMove: ((stickerId: string, x: number, y: number) => Promise<void>) | null;
}) {
  const rootRef = useRef<HTMLUListElement>(null);
  const onScreen = useRef(new Set<string>());
  const stickersRef = useRef(item.stickers);
  const photoRef = useRef(item.id);
  const dragRef = useRef<Drag | null>(null);
  const onMoveRef = useRef(onMove);
  const skipClick = useRef(false);
  stickersRef.current = item.stickers;
  photoRef.current = item.id;
  onMoveRef.current = onMove;
  const [seenRev, setSeenRev] = useState(0);
  const [unseen, setUnseen] = useState<ReadonlySet<string>>(() => new Set());
  const [placed, setPlaced] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function markViewed(stickerIds: Iterable<string>): boolean {
    let changed = false;
    for (const stickerId of stickerIds) {
      const sticker = stickersRef.current.find((mark) => mark.id === stickerId);
      if (!sticker) continue;
      if (
        noteStickerViewed(localStorage, {
          photoId: photoRef.current,
          stickerId: sticker.id,
          profileId: sticker.profileId,
          pinnedAt: sticker.pinnedAt,
          mine: sticker.mine,
        })
      ) {
        changed = true;
      }
    }
    return changed;
  }

  const markRef = useRef(markViewed);
  markRef.current = markViewed;

  function reveal(sticker: FrameSticker) {
    onScreen.current.delete(sticker.id);
    if (markViewed([sticker.id])) setSeenRev((value) => value + 1);
    onPreview(sticker);
  }

  useEffect(() => {
    const watching = onScreen.current;
    return () => {
      if (watching.size === 0) return;
      const ids = [...watching];
      watching.clear();
      markRef.current(ids);
    };
  }, []);

  useEffect(() => {
    if (dragRef.current) return;
    setPlaced((current) => {
      let changed = false;
      const next: Record<string, { x: number; y: number }> = {};
      for (const [id, point] of Object.entries(current)) {
        const sticker = item.stickers.find((mark) => mark.id === id);
        if (!sticker || (Math.abs(sticker.x - point.x) < 0.15 && Math.abs(sticker.y - point.y) < 0.15)) {
          changed = true;
          continue;
        }
        next[id] = point;
      }
      return changed ? next : current;
    });
  }, [item.stickers]);

  useEffect(() => {
    const next = new Set<string>();
    if (item.onFeed) {
      for (const sticker of item.stickers) {
        if (
          stickerUnseen(localStorage, {
            photoId: item.id,
            stickerId: sticker.id,
            profileId: sticker.profileId,
            pinnedAt: sticker.pinnedAt,
            mine: sticker.mine,
          })
        ) {
          next.add(sticker.id);
        }
      }
    }
    setUnseen((current) => {
      if (current.size === next.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [item.id, item.onFeed, item.stickers, seenRev]);

  useEffect(() => {
    const root = rootRef.current;
    if (!shown || !root || unseen.size === 0 || typeof IntersectionObserver === "undefined") {
      if (!shown && onScreen.current.size > 0) {
        const ids = [...onScreen.current];
        onScreen.current.clear();
        if (markRef.current(ids)) setSeenRev((value) => value + 1);
      }
      return;
    }
    const scroll = root.closest(".scroll, .lightbox");
    const observer = new IntersectionObserver(
      (entries) => {
        const left: string[] = [];
        for (const entry of entries) {
          const stickerId = (entry.target as HTMLElement).dataset.stickerId;
          if (!stickerId) continue;
          // The stronger edge stays while the emoji is on screen. It returns
          // to the usual sticker once that look ends.
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            onScreen.current.add(stickerId);
            continue;
          }
          if (!entry.isIntersecting && onScreen.current.has(stickerId)) {
            onScreen.current.delete(stickerId);
            left.push(stickerId);
          }
        }
        if (left.length > 0 && markRef.current(left)) setSeenRev((value) => value + 1);
      },
      { root: scroll instanceof Element ? scroll : null, threshold: [0, 0.5] },
    );
    for (const button of root.querySelectorAll<HTMLElement>("[data-unseen='true']")) observer.observe(button);
    return () => observer.disconnect();
  }, [shown, unseen, item.id]);

  function pointOf(drag: Drag, event: ReactPointerEvent<HTMLButtonElement>): { x: number; y: number } {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width < 1 || bounds.height < 1) return { x: drag.originX, y: drag.originY };
    return clampStickerPoint(
      drag.originX + ((event.clientX - drag.startX) / bounds.width) * 100,
      drag.originY + ((event.clientY - drag.startY) / bounds.height) * 100,
    );
  }

  function dropPlaced(id: string) {
    setPlaced((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  if (item.stickers.length === 0) return null;
  return (
    <ul className="stickers" aria-label="Stickers on this frame" ref={rootRef}>
      {item.stickers.map((sticker, index) => {
        const spot = placed[sticker.id] ?? { x: sticker.x, y: sticker.y };
        const style = stickerStyle(spot, index);
        const fresh = unseen.has(sticker.id);
        const movable = canMoveSticker({
          onFeed: Boolean(onMove),
          stickerMine: sticker.mine,
          frameMine: item.mine,
        });
        return (
          <li key={sticker.id}>
            <button
              className="sticker"
              style={style}
              type="button"
              data-sticker={sticker.emoji}
              data-sticker-id={sticker.id}
              data-profile-id={sticker.profileId}
              data-sticker-preview={sticker.id}
              data-mine={sticker.mine ? "true" : "false"}
              data-can-move={movable ? "true" : "false"}
              data-unseen={fresh ? "true" : undefined}
              data-dragging={draggingId === sticker.id ? "true" : undefined}
              title={sticker.profileName}
              aria-label={`${sticker.profileName} stuck ${sticker.emoji}`}
              onPointerDown={(event) => {
                if (event.button !== 0 || !movable) return;
                event.stopPropagation();
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  id: sticker.id,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: spot.x,
                  originY: spot.y,
                  x: spot.x,
                  y: spot.y,
                  moved: false,
                };
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId || drag.id !== sticker.id) return;
                const travel = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
                if (!drag.moved && travel < DRAG_SLOP) return;
                drag.moved = true;
                const point = pointOf(drag, event);
                drag.x = point.x;
                drag.y = point.y;
                setDraggingId(sticker.id);
                setPlaced((current) => ({ ...current, [sticker.id]: point }));
              }}
              onPointerUp={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId || drag.id !== sticker.id) return;
                dragRef.current = null;
                skipClick.current = true;
                setDraggingId(null);
                if (!drag.moved) {
                  reveal(sticker);
                  return;
                }
                const point = { x: drag.x, y: drag.y };
                setPlaced((current) => ({ ...current, [sticker.id]: point }));
                const save = onMoveRef.current;
                if (!save) {
                  dropPlaced(sticker.id);
                  return;
                }
                void save(sticker.id, point.x, point.y).catch(() => dropPlaced(sticker.id));
              }}
              onPointerCancel={() => {
                const drag = dragRef.current;
                if (!drag || drag.id !== sticker.id) return;
                dragRef.current = null;
                skipClick.current = true;
                setDraggingId(null);
                dropPlaced(sticker.id);
              }}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                if (skipClick.current) {
                  skipClick.current = false;
                  return;
                }
                reveal(sticker);
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

function StickerSlip({
  sticker,
  busy,
  error,
  onClose,
  onRemove,
}: {
  sticker: FrameSticker;
  busy: boolean;
  error: string;
  onClose: () => void;
  onRemove: (() => void) | null;
}) {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let stop = false;
    setProfile(null);
    fetchPublicProfile(sticker.profileId)
      .then((row) => {
        if (!stop) setProfile(row);
      })
      .catch(() => {
        if (!stop) setProfile(null);
      });
    return () => {
      stop = true;
    };
  }, [sticker.profileId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = profile?.username || sticker.profileName;

  return (
    <div
      className="sticker-slip"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} stuck ${sticker.emoji}`}
      data-sticker-preview={sticker.id}
    >
      <button className="sticker-slip-scrim" type="button" aria-label="Close" onClick={onClose} />
      <div className="sticker-slip-stack">
        <figure className="sticker-slip-card" data-mine={sticker.mine ? "true" : "false"}>
          {profile?.avatarUrl ? (
            <img className="slip-thumb" src={profile.avatarUrl} alt="" />
          ) : (
            <span className="slip-thumb slip-thumb-empty" aria-hidden="true" />
          )}
          <div className="slip-who">
            <p className="slip-name" data-preview-name={name}>
              {name}
            </p>
            {onRemove ? (
              <button
                className="slip-remove"
                type="button"
                data-sticker-remove={sticker.id}
                aria-label={`Remove your ${sticker.emoji}`}
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="slip-emoji">{sticker.emoji}</p>
        </figure>
        {error ? <p className="error">{error}</p> : null}
        <button ref={closeRef} className="sticker-slip-close" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function NoteLine({ note }: { note: FrameComment }) {
  const marks = note.emojis.filter((emoji) => emoji.length > 0);
  return (
    <>
      {marks.length > 0 ? (
        <span className="note-marks" aria-hidden="true">
          {marks.join("")}
        </span>
      ) : null}
      <span className="note-copy">
        <span className="frame-note-text" data-hand={note.hand}>
          {note.text}
        </span>
        <span className="frame-note-name">{note.profileName}</span>
      </span>
    </>
  );
}

function FrameNotes({
  frameId,
  comments,
  canWrite,
  canDelete,
  draft,
  onDraft,
  onSign,
  onDelete,
  openId,
  onOpen,
  needsName,
  name,
  onName,
  nameId,
  error,
  busy,
}: {
  frameId: string;
  comments: FrameComment[];
  canWrite: boolean;
  canDelete: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onSign: () => void;
  onDelete: (id: string) => void;
  openId: string | null;
  onOpen: (id: string) => void;
  needsName: boolean;
  name: string;
  onName: (value: string) => void;
  nameId: string;
  error: string;
  busy: boolean;
}) {
  return (
    <>
      {comments.length === 0 && !canWrite ? <p className="frame-note-empty">Nothing on the back yet.</p> : null}
      {comments.length > 0 ? (
        <ul className="frame-notes" aria-label="Notes on the back" onClick={(event) => event.stopPropagation()}>
          {comments.map((note) => {
            const open = canDelete && note.mine && openId === note.id;
            return (
              <li
                key={note.id}
                className="frame-note"
                data-mine={note.mine ? "true" : "false"}
                data-open={open ? "true" : "false"}
              >
                <div className="note-line">
                  {canDelete && note.mine ? (
                    <button
                      className="note-hit"
                      type="button"
                      aria-expanded={open}
                      onClick={() => onOpen(note.id)}
                    >
                      <NoteLine note={note} />
                    </button>
                  ) : (
                    <div className="note-hit">
                      <NoteLine note={note} />
                    </div>
                  )}
                  {open ? (
                    <button className="frame-note-delete" type="button" onClick={() => onDelete(note.id)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {canWrite ? (
        <div className="frame-note-fresh" data-frame-draft="open" onClick={(event) => event.stopPropagation()}>
          <input
            className="frame-note-draft"
            value={draft}
            maxLength={FRAME_NOTE_LIMIT}
            placeholder="Write on the back"
            aria-label="Write on the back"
            autoComplete="off"
            enterKeyHint="send"
            data-frame-note={frameId}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onSign();
            }}
          />
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
                onChange={(event) => onName(event.target.value)}
              />
              <p className="fine">So the note has a person. Change the marks later on You.</p>
            </>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          <button
            className="frame-note-sign"
            type="button"
            data-frame-sign="open"
            disabled={busy || draft.trim().length === 0}
            onClick={onSign}
          >
            Sign
          </button>
        </div>
      ) : null}
    </>
  );
}

function FrameFace({
  item,
  imageRef,
  onStickers,
  onComments,
  notes = "feed",
  noteSignal = false,
}: {
  item: FeedItem;
  imageRef: RefObject<HTMLImageElement | null>;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
  onComments?: (id: string, comments: FrameComment[]) => void;
  notes?: "feed" | "owner";
  /** The blue frame outline. Only the feed list passes this. */
  noteSignal?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState(false);
  const [back, setBack] = useState(false);
  const [preview, setPreview] = useState<FrameSticker | null>(null);
  const [pins, setPins] = useState(item.stickers);
  const [slipError, setSlipError] = useState("");
  const [name, setName] = useState(() => loadProfile().username);
  const [needsName, setNeedsName] = useState(() => !profileReady(loadProfile()));
  const [held, setHeld] = useState("");
  const [draft, setDraft] = useState("");
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteRev, setNoteRev] = useState(0);
  const [quick, setQuick] = useState<string[]>([]);
  const quickRef = useRef<string[]>([]);
  const reactable = Boolean(onStickers) && !item.mine;
  const ownPhoto = photoBackOpens(item.mine);
  const canOpenNotes = notes === "owner" ? ownPhoto : true;
  const canWrite = Boolean(onComments) && (notes === "owner" ? ownPhoto : !item.mine);
  const turned = back && canOpenNotes;
  const noteStamps = item.comments.map((note) => ({
    photoId: item.id,
    noteId: note.id,
    createdAt: note.createdAt,
    mine: note.mine,
  }));
  // noteRev rerenders once the open back has been written down.
  const noteFresh =
    noteSignal && item.onFeed && noteRev >= 0 && frameHasUnseenNote(localStorage, noteStamps);
  const nameId = `sticker-name-${item.id}`;
  const frame = { ...item, stickers: pins };

  useEffect(() => {
    setPins(item.stickers);
  }, [item.id, item.stickers]);

  useEffect(() => {
    setPreview((current) => {
      if (!current) return current;
      return pins.some((sticker) => sticker.id === current.id) ? current : null;
    });
  }, [pins]);

  function closeKeyboard() {
    inputRef.current?.blur();
    setComposing(false);
    setHeld("");
    setError("");
    setBusy(false);
  }

  function openKeyboard() {
    const next = pickQuickStickers(EMOJI_CHOICES, quickRef.current);
    quickRef.current = next;
    setQuick(next);
    setBack(false);
    setComposing(true);
    setError("");
  }

  function openEmojiKeyboard() {
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.focus();
  }

  const tap = useFrameTap(
    canOpenNotes
      ? () => {
          setBack((value) => !value);
          if (!back) closeKeyboard();
        }
      : null,
    !back && reactable ? openKeyboard : null,
  );

  useEffect(() => {
    if (!composing && !back) return;
    let stop = false;
    fetchOwnProfile()
      .then((remote) => {
        if (stop || !remote) return;
        const next = withCameraPortrait(profileFromServer(remote), loadProfile());
        if (profileReady(next)) {
          try {
            saveProfile(next);
          } catch {
            /* the name is already on the server */
          }
        }
        setNeedsName(false);
      })
      .catch((err: unknown) => {
        if (stop || !isProfileRemoved(err)) return;
        setNeedsName(true);
        setName("");
      });
    if (!composing) return () => {
      stop = true;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeKeyboard();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stop = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [composing, back]);

  // Opening the back marks the notes already there. Scrolling past the front
  // does not: the note is not on the front, so the outline stays until the back shows.
  useEffect(() => {
    if (!turned) return;
    const stamps = item.comments.map((note) => ({
      photoId: item.id,
      noteId: note.id,
      createdAt: note.createdAt,
      mine: note.mine,
    }));
    if (noteNotesViewed(localStorage, stamps)) setNoteRev((value) => value + 1);
  }, [turned, item.id, item.comments]);

  async function place(emoji: string) {
    if (busy) return;
    if (needsName && !name.trim()) {
      setHeld(emoji);
      setError("Give yourself a short name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await ensureStickerIdentity(name, needsName);
      const result = await setFrameSticker(item.id, emoji);
      setPins(result.stickers);
      onStickers?.(item.id, result.stickers);
      closeKeyboard();
    } catch (err) {
      if (isProfileRemoved(err)) {
        setNeedsName(true);
        setName("");
      }
      setError(err instanceof Error ? err.message : "That sticker didn't stick.");
      setBusy(false);
    }
  }

  async function sendNote() {
    const note = draft.trim();
    if (!note || busy) return;
    if (needsName && !name.trim()) {
      setError("Give yourself a short name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await ensureStickerIdentity(name, needsName);
      const result = await setFrameNote(item.id, note);
      onComments?.(item.id, result.comments);
      setDraft("");
      setOpenNote(null);
      setBack(true);
      setBusy(false);
    } catch (err) {
      if (isProfileRemoved(err)) {
        setNeedsName(true);
        setName("");
      }
      setError(err instanceof Error ? err.message : "That note didn't land.");
      setBusy(false);
    }
  }

  async function peel(sticker: FrameSticker) {
    if (!sticker.mine || busy) return;
    setBusy(true);
    setSlipError("");
    try {
      const result = await removeFrameSticker(item.id, sticker.id);
      setPins(result.stickers);
      onStickers?.(item.id, result.stickers);
      setPreview(null);
      setBusy(false);
    } catch (err) {
      setSlipError(err instanceof Error ? err.message : "That sticker stayed put.");
      setBusy(false);
    }
  }

  async function nudge(stickerId: string, x: number, y: number) {
    const result = await moveFrameSticker(item.id, stickerId, x, y);
    setPins(result.stickers);
    onStickers?.(item.id, result.stickers);
  }

  async function deleteNote(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await removeFrameNote(item.id, id);
      onComments?.(item.id, result.comments);
      setOpenNote(null);
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That note stayed put.");
      setBusy(false);
    }
  }

  const image = (
    <img ref={imageRef} src={`/api/photos/${item.id}/image`} alt={item.caption || "Developed frame"} />
  );
  const label = reactable
    ? "Turn the frame over. Double tap to leave a sticker."
    : notes === "owner"
      ? "Turn the photo over."
      : "Turn the frame over.";
  const interactive = canOpenNotes || reactable;

  return (
    <>
      <div
        className={`frame-stage${turned ? " is-back" : ""}`}
        data-back={turned ? "true" : "false"}
        data-note-unseen={noteFresh ? "true" : undefined}
        data-notes={canOpenNotes ? (notes === "owner" ? "owner" : "feed") : "closed"}
      >
        <div className="frame-card">
          <div className="frame-face frame-front" inert={turned}>
            {interactive ? (
              <button className="frame" type="button" onClick={tap} aria-label={label} data-frame={item.id}>
                {image}
              </button>
            ) : (
              <div className="frame" data-frame={item.id}>
                {image}
              </div>
            )}
            <StickerLayer
              item={frame}
              shown={!turned}
              onPreview={(sticker) => {
                setSlipError("");
                setPreview(sticker);
              }}
              onMove={item.onFeed ? nudge : null}
            />
            {preview ? (
              <StickerSlip
                sticker={preview}
                busy={busy}
                error={slipError}
                onClose={() => {
                  setPreview(null);
                  setSlipError("");
                }}
                onRemove={preview.mine && item.onFeed ? () => void peel(preview) : null}
              />
            ) : null}
          </div>
          {canOpenNotes ? (
            <div
              className="frame-face frame-back"
              data-frame-back={item.id}
              inert={!turned}
              onClick={() => setBack(false)}
            >
              <FrameNotes
                frameId={item.id}
                comments={item.comments}
                canWrite={canWrite}
                canDelete={Boolean(onComments)}
                draft={draft}
                onDraft={setDraft}
                onSign={() => void sendNote()}
                onDelete={(id) => void deleteNote(id)}
                openId={openNote}
                onOpen={(id) => setOpenNote((current) => (current === id ? null : id))}
                needsName={needsName && back}
                name={name}
                onName={setName}
                nameId={nameId}
                error={back ? error : ""}
                busy={busy}
              />
              <button
                className="frame-turn"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setBack(false);
                }}
              >
                Turn over
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {reactable ? (
        <input
          ref={inputRef}
          className="field emoji-type emoji-keyboard"
          inputMode="text"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Type an emoji"
          tabIndex={-1}
          data-emoji-keyboard={item.id}
          onInput={(event) => {
            const input = event.currentTarget;
            const emoji = takeEmoji(input.value);
            if (!emoji) {
              setError(input.value.trim() ? "That isn't an emoji." : "");
              return;
            }
            input.value = "";
            setError("");
            void place(emoji);
          }}
        />
      ) : null}
      {composing ? (
        <div className="emoji-compose" data-emoji-compose={item.id}>
          <div className="quick-stickers" role="group" aria-label="Seven stickers and your own" data-quick-stickers={item.id}>
            {quick.map((emoji) => (
              <button
                key={emoji}
                className="quick-sticker"
                type="button"
                data-quick-sticker={emoji}
                aria-label={`Stick ${emoji}`}
                disabled={busy}
                onClick={() => void place(emoji)}
              >
                {emoji}
              </button>
            ))}
            <button
              className="quick-sticker quick-plus"
              type="button"
              data-emoji-plus={item.id}
              aria-label="Type your own emoji"
              disabled={busy}
              onClick={openEmojiKeyboard}
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <p className="fine">Tap one to add it. Drag a sticker if it covers the photo.</p>
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
              <p className="fine">So the note has a person. Change the marks later on You.</p>
              {held ? (
                <button className="primary" type="button" disabled={busy} onClick={() => void place(held)}>
                  Stick {held}
                </button>
              ) : null}
            </>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          <button className="ghost" type="button" onClick={closeKeyboard} disabled={busy}>
            Close
          </button>
        </div>
      ) : null}
    </>
  );
}

function ProfileLink({ item, onOpenProfile }: { item: FeedItem; onOpenProfile?: (id: string) => void }) {
  if (!item.profileId || !item.profileName || !item.profileEmojis) return null;
  const marks = item.profileEmojis.join("");
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
  return item.eventName || "";
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

function PhotoCaption({
  item,
  onCaption,
  editable = false,
}: {
  item: FeedItem;
  onCaption?: (id: string, caption: string) => void;
  editable?: boolean;
}) {
  if (editable && item.mine && !item.onFeed && item.eventId) {
    return <CaptionField id={item.id} caption={item.caption} onCaption={onCaption} />;
  }
  if (!item.caption) return null;
  return <figcaption className="caption">{item.caption}</figcaption>;
}

export function PrintView({
  item,
  onOpenProfile,
  onDelete,
  onStickers,
  onComments,
  onCaption,
  notes = "feed",
  noteSignal = false,
  compact = false,
}: {
  item: FeedItem;
  onOpenProfile?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
  onComments?: (id: string, comments: FrameComment[]) => void;
  onCaption?: (id: string, caption: string) => void;
  notes?: "feed" | "owner";
  noteSignal?: boolean;
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
      <FrameFace item={item} imageRef={imageRef} onStickers={onStickers} onComments={onComments} notes={notes} noteSignal={noteSignal} />
      {!compact ? <PhotoCaption item={item} onCaption={onCaption} editable /> : null}
      {!compact ? <ProfileLink item={item} onOpenProfile={onOpenProfile} /> : null}
      <p className="meta">{meta}</p>
      <FrameActions item={item} getImage={() => imageRef.current} onDelete={onDelete} />
    </figure>
  );
}

export function Lightbox({
  item,
  onClose,
  onOpenProfile,
  onDelete,
  onStickers,
  onComments,
  onCaption,
  notes = "feed",
  noteSignal = false,
}: {
  item: FeedItem;
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
  onComments?: (id: string, comments: FrameComment[]) => void;
  onCaption?: (id: string, caption: string) => void;
  notes?: "feed" | "owner";
  noteSignal?: boolean;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const where = place(item);
  const meta = [where, ago(item.createdAt), leavesIn(item.sortAt)].filter(Boolean).join(" · ");
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.caption || "Frame"} onClick={onClose}>
      <figure className="print" onClick={(event) => event.stopPropagation()}>
        <FrameFace item={item} imageRef={imageRef} onStickers={onStickers} onComments={onComments} notes={notes} noteSignal={noteSignal} />
        <PhotoCaption item={item} onCaption={onCaption} />
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
