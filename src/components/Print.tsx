"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fetchOwnProfile, fetchPublicProfile, isProfileRemoved, saveOwnProfile, setFrameNote, setFrameSticker } from "@/lib/api";
import { CaptionField } from "@/components/CaptionField";
import { FRAME_NOTE_LIMIT } from "@/lib/frame-note";
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
import {
  ensurePhotoFile,
  fileFromImage,
  iosPhotosTarget,
  readyPhotoFile,
  shareOrSave,
  warmPhoto,
} from "@/lib/save";
import type { FeedItem, FrameComment, FrameSticker, SharedProfile } from "@/lib/types";

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

function StickerLayer({
  item,
  onPreview,
}: {
  item: FeedItem;
  onPreview: (sticker: FrameSticker) => void;
}) {
  if (item.stickers.length === 0) return null;
  return (
    <ul className="stickers" aria-label="Stickers on this frame">
      {item.stickers.map((sticker, index) => {
        const style = stickerStyle(index);
        return (
          <li key={sticker.profileId}>
            <button
              className="sticker"
              style={style}
              type="button"
              data-sticker={sticker.emoji}
              data-profile-id={sticker.profileId}
              data-sticker-preview={sticker.profileId}
              data-mine={sticker.mine ? "true" : "false"}
              title={sticker.profileName}
              aria-label={`Preview ${sticker.profileName}'s profile`}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onPreview(sticker);
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

function StickerPreview({
  sticker,
  ownPhoto,
  onOpenProfile,
  onClose,
}: {
  sticker: FrameSticker;
  ownPhoto: boolean;
  onOpenProfile?: (id: string) => void;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let stop = false;
    setProfile(null);
    setError("");
    fetchPublicProfile(sticker.profileId)
      .then((row) => {
        if (!stop) setProfile(row);
      })
      .catch((err: unknown) => {
        if (!stop) setError(err instanceof Error ? err.message : "That profile is gone.");
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
  const marks = profile?.emojis ?? [];

  return (
    <div
      className="lightbox sticker-preview"
      role="dialog"
      aria-modal="true"
      aria-label={`${name}'s profile`}
      data-sticker-preview={sticker.profileId}
      onClick={onClose}
    >
      <figure className="print identity" onClick={(event) => event.stopPropagation()}>
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" />
        ) : (
          <div className="portrait-empty" aria-hidden="true">
            {profile ? "No photo" : error ? "No photo" : "…"}
          </div>
        )}
        <h2 className="caption" data-preview-name={name}>
          {name}
        </h2>
        {marks.length > 0 ? (
          <p className="marks">
            {marks.map((emoji, slot) => (
              <span key={slot}>{emoji}</span>
            ))}
          </p>
        ) : null}
        <p className="fine">Stuck {sticker.emoji}</p>
        {error ? <p className="error">{error}</p> : null}
        {ownPhoto && onOpenProfile ? (
          <button
            className="ghost"
            type="button"
            data-open-profile={sticker.profileId}
            onClick={() => onOpenProfile(sticker.profileId)}
          >
            Open profile
          </button>
        ) : null}
      </figure>
      <button ref={closeRef} className="ghost" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function FrameNotes({ comments }: { comments: FrameComment[] }) {
  if (comments.length === 0) {
    return <p className="frame-note-empty">Nothing on the back yet.</p>;
  }
  return (
    <ul className="frame-notes" aria-label="Notes on the back">
      {comments.map((note) => (
        <li key={note.profileId} className="frame-note" data-mine={note.mine ? "true" : "false"}>
          <p className="frame-note-text">{note.text}</p>
          <p className="frame-note-name">{note.profileName}</p>
        </li>
      ))}
    </ul>
  );
}

function FrameFace({
  item,
  imageRef,
  onOpenProfile,
  onStickers,
  onComments,
}: {
  item: FeedItem;
  imageRef: RefObject<HTMLImageElement | null>;
  onOpenProfile?: (id: string) => void;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
  onComments?: (id: string, comments: FrameComment[]) => void;
}) {
  const commentRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState(false);
  const [back, setBack] = useState(false);
  const [preview, setPreview] = useState<FrameSticker | null>(null);
  const [name, setName] = useState(() => loadProfile().username);
  const [needsName, setNeedsName] = useState(() => !profileReady(loadProfile()));
  const [held, setHeld] = useState("");
  const [heldNote, setHeldNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<string[]>([]);
  const quickRef = useRef<string[]>([]);
  const reactable = Boolean(onStickers) && !item.mine;
  const nameId = `sticker-name-${item.id}`;
  const mineEmoji = item.stickers.find((sticker) => sticker.mine)?.emoji ?? "";

  function closeKeyboard() {
    commentRef.current?.classList.remove("is-open");
    commentRef.current?.blur();
    inputRef.current?.blur();
    setComposing(false);
    setHeld("");
    setHeldNote("");
    setBusy(false);
  }

  function openKeyboard() {
    const input = commentRef.current;
    if (!input) return;
    const next = pickQuickStickers(EMOJI_CHOICES, quickRef.current);
    quickRef.current = next;
    setQuick(next);
    input.value = item.comments.find((note) => note.mine)?.text ?? "";
    input.classList.add("is-open");
    input.removeAttribute("aria-hidden");
    setBack(false);
    void input.getBoundingClientRect();
    // Focus in this tap, before any await. A later focus does not open the phone keyboard.
    input.focus();
    setComposing(true);
    setError("");
  }

  function openEmojiKeyboard() {
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.focus();
  }

  const tap = useFrameTap(() => {
    setBack((value) => !value);
    if (!back) closeKeyboard();
  }, !back && reactable ? openKeyboard : null);

  useEffect(() => {
    if (!composing) return;
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeKeyboard();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stop = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [composing]);

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
      onStickers?.(item.id, result.stickers);
      const draft = commentRef.current?.value.trim() ?? "";
      if (draft) {
        setBusy(false);
        setHeld("");
        return;
      }
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

  async function sendNote(text?: string) {
    const note = (text ?? commentRef.current?.value ?? "").trim();
    if (!note) {
      setError("Write a note.");
      return;
    }
    if (busy) return;
    if (needsName && !name.trim()) {
      setHeldNote(note);
      setError("Give yourself a short name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await ensureStickerIdentity(name, needsName);
      const result = await setFrameNote(item.id, note);
      onComments?.(item.id, result.comments);
      closeKeyboard();
      setBack(true);
    } catch (err) {
      if (isProfileRemoved(err)) {
        setNeedsName(true);
        setName("");
      }
      setError(err instanceof Error ? err.message : "That note didn't land.");
      setBusy(false);
    }
  }

  const image = (
    <img ref={imageRef} src={`/api/photos/${item.id}/image`} alt={item.caption || "Developed frame"} />
  );
  const label = reactable
    ? "Turn the frame over. Double tap to leave a note or a sticker."
    : "Turn the frame over.";

  return (
    <>
      <div className={`frame-stage${back ? " is-back" : ""}`} data-back={back ? "true" : "false"}>
        <div className="frame-card">
          <div className="frame-face frame-front" inert={back}>
            <button className="frame" type="button" onClick={tap} aria-label={label} data-frame={item.id}>
              {image}
            </button>
            <StickerLayer item={item} onPreview={setPreview} />
          </div>
          <div
            className="frame-face frame-back"
            data-frame-back={item.id}
            inert={!back}
            onClick={() => setBack(false)}
          >
            <FrameNotes comments={item.comments} />
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
        </div>
      </div>
      {reactable ? (
        <input
          ref={commentRef}
          className={`field comment-type${composing ? " is-open" : ""}`}
          inputMode="text"
          enterKeyHint="send"
          autoComplete="off"
          maxLength={FRAME_NOTE_LIMIT}
          placeholder="Write on the back"
          aria-label="Write on the back"
          aria-hidden={composing ? undefined : true}
          tabIndex={composing ? 0 : -1}
          data-frame-note={item.id}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void sendNote();
          }}
        />
      ) : null}
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
          <p className="fine">
            {mineEmoji ? `Yours is ${mineEmoji}. Pick again to change it.` : "One sticker. It stays on the frame."}
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
              <p className="fine">So the note has a person. Change the marks later on You.</p>
              {held ? (
                <button className="primary" type="button" disabled={busy} onClick={() => void place(held)}>
                  Stick {held}
                </button>
              ) : null}
              {heldNote ? (
                <button className="primary" type="button" disabled={busy} onClick={() => void sendNote(heldNote)}>
                  Leave the note
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
      {preview ? (
        <StickerPreview
          sticker={preview}
          ownPhoto={item.mine}
          onOpenProfile={onOpenProfile}
          onClose={() => setPreview(null)}
        />
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
  compact = false,
}: {
  item: FeedItem;
  onOpenProfile?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
  onComments?: (id: string, comments: FrameComment[]) => void;
  onCaption?: (id: string, caption: string) => void;
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
        onOpenProfile={onOpenProfile}
        onStickers={onStickers}
        onComments={onComments}
      />
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
}: {
  item: FeedItem;
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
  onStickers?: (id: string, stickers: FrameSticker[]) => void;
  onComments?: (id: string, comments: FrameComment[]) => void;
  onCaption?: (id: string, caption: string) => void;
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
          onComments={onComments}
        />
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
