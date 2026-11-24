"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Sleeve } from "@/components/Sleeve";
import { fetchFeed, fetchOwnProfile, fetchPublicProfile, saveOwnProfile } from "@/lib/api";
import {
  CAROUSEL_LIMIT,
  EMOJI_GROUPS,
  NAME_LIMIT,
  clearDraft,
  draftWithSavedPortrait,
  emptyProfile,
  loadDraft,
  loadProfile,
  moveCarouselId,
  portraitFromFile,
  profileFromServer,
  profileReady,
  profileWrite,
  profilesEqual,
  saveProfile,
  storeDraft,
  storeCameraProfile,
  takeEmoji,
  toggleCarouselId,
  withCameraPortrait,
  type Profile,
} from "@/lib/profile";
import type { FeedItem, SharedProfile } from "@/lib/types";

type Mode = "page" | "edit" | "arrange";

function captionFor(id: string, photos: FeedItem[]): string {
  const caption = photos.find((photo) => photo.id === id)?.caption?.trim();
  return caption || "Frame";
}

export function Profile({ revision }: { revision: number }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile>(emptyProfile);
  const [mode, setMode] = useState<Mode | null>(null);
  const [photos, setPhotos] = useState<FeedItem[]>([]);
  const [feedError, setFeedError] = useState("");
  const [formError, setFormError] = useState("");
  const [activeSlot, setActiveSlot] = useState(0);
  const [typed, setTyped] = useState("");
  const [typedHint, setTypedHint] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moreFrames, setMoreFrames] = useState(false);
  const [pool, setPool] = useState<"all" | "mine">("all");
  const [index, setIndex] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const mounted = useRef(true);
  const write = useRef(0);

  useEffect(() => {
    mounted.current = true;
    let stop = false;
    async function load() {
      try {
        const local = loadProfile();
        const remote = await fetchOwnProfile();
        if (stop) return;
        let saved = remote ? withCameraPortrait(profileFromServer(remote), local) : emptyProfile();
        if (!remote && profileReady(local)) {
          const created = await saveOwnProfile(profileWrite(local));
          if (stop) return;
          saved = withCameraPortrait(profileFromServer(created), local);
          saveProfile(saved);
        } else if (remote) {
          storeCameraProfile(saved);
        }
        const pending = loadDraft();
        setProfile(saved);
        if (pending && !profilesEqual(pending, saved)) {
          setDraft(draftWithSavedPortrait(pending, saved));
          setMode("edit");
        } else {
          clearDraft();
          setDraft(saved);
          setMode(profileReady(saved) ? "page" : "edit");
        }
      } catch (err) {
        if (stop) return;
        const local = loadProfile();
        const pending = loadDraft();
        setProfile(local);
        setDraft(pending && !profilesEqual(pending, local) ? draftWithSavedPortrait(pending, local) : local);
        setMode(profileReady(local) ? "page" : "edit");
        setFormError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
    void load();
    return () => {
      stop = true;
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "edit") return;
    storeDraft(draft);
  }, [draft, mode]);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const data = await fetchFeed();
        if (stop) return;
        setPhotos(data.photos);
        setFeedError("");
      } catch (err) {
        if (!stop) setFeedError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [revision]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  function beginEdit() {
    if (!profile) return;
    setDraft(profile);
    setActiveSlot(0);
    setTyped("");
    setTypedHint("");
    setFormError("");
    setMoreFrames(false);
    setMode("edit");
  }

  function discardEdit() {
    if (!profile || !profileReady(profile)) return;
    clearDraft();
    setDraft(profile);
    setFormError("");
    setMode("page");
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    setSaving(true);
    try {
      const saved = await persist(draft, true);
      if (!saved) return;
      clearDraft();
      setDraft(saved);
      setMode("page");
      setIndex(0);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "The lab didn't answer.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  async function persist(next: Profile, replaceRemoved = false): Promise<Profile | null> {
    const ticket = write.current + 1;
    write.current = ticket;
    const remote = profileFromServer(await saveOwnProfile(profileWrite(next), { replaceRemoved }));
    if (ticket !== write.current) return null;
    const bytes = next.avatarDataUrl
      ? next.avatarDataUrl
      : next.avatarUrl?.endsWith("/avatar")
        ? loadProfile().avatarDataUrl
        : null;
    const saved = withCameraPortrait(remote, { ...next, avatarDataUrl: bytes });
    saveProfile(saved);
    setProfile(saved);
    return saved;
  }

  function chooseEmoji(emoji: string) {
    setDraft((current) => {
      const emojis = [...current.emojis] as Profile["emojis"];
      emojis[activeSlot] = emoji;
      return { ...current, emojis };
    });
    setTyped("");
    setTypedHint("");
    setActiveSlot((slot) => (slot + 1) % 3);
  }

  async function onPortraitFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setFormError("");
    try {
      const avatarDataUrl = await portraitFromFile(file);
      if (!mounted.current) return;
      setDraft((current) => ({ ...current, avatarDataUrl, avatarPhotoId: null, avatarUrl: null }));
    } catch (err) {
      if (mounted.current) setFormError(err instanceof Error ? err.message : "This photo can't be read.");
    } finally {
      if (mounted.current) setReading(false);
    }
  }

  async function updateCarousel(nextIds: string[]) {
    if (!profile) return;
    const previous = profile;
    const optimistic = { ...profile, carouselIds: nextIds };
    setProfile(optimistic);
    try {
      const saved = await persist(optimistic);
      if (saved) setFormError("");
    } catch (err) {
      if (write.current) setProfile(previous);
      setFormError(err instanceof Error ? err.message : "The lab didn't answer.");
    }
  }

  function addOrRemove(id: string) {
    if (!profile) return;
    const result = toggleCarouselId(profile.carouselIds, id);
    if (result.full) return;
    updateCarousel(result.ids);
  }

  if (!profile || !mode) {
    return (
      <div className="profile-screen" data-screen="profile">
        <Sleeve />
      </div>
    );
  }

  const openPhoto = openId
    ? photos.find((photo) => photo.id === openId) ?? { id: openId, caption: "" }
    : null;

  return (
    <div className="profile-screen" data-screen="profile" data-mode={mode}>
      <Sleeve />
      <div className="scroll">
      {formError ? <p className="error">{formError}</p> : null}
      {mode === "page" ? (
        <ProfilePage
          profile={profile}
          photos={photos}
          feedError={feedError}
          index={index}
          onIndex={setIndex}
          onEdit={beginEdit}
          onArrange={() => {
            setFormError("");
            setPool("all");
            setMode("arrange");
          }}
          onOpen={setOpenId}
        />
      ) : null}
      {mode === "edit" ? (
        <ProfileEditor
          draft={draft}
          saved={profileReady(profile)}
          photos={photos}
          feedError={feedError}
          activeSlot={activeSlot}
          typed={typed}
          typedHint={typedHint}
          reading={reading}
          moreFrames={moreFrames}
          onDraft={setDraft}
          onSlot={setActiveSlot}
          onTyped={setTyped}
          onTypedHint={setTypedHint}
          onChoose={chooseEmoji}
          onFile={(file) => void onPortraitFile(file)}
          onMore={() => setMoreFrames(true)}
          onBack={discardEdit}
          onSave={(event) => void onSave(event)}
          busy={saving}
        />
      ) : null}
      {mode === "arrange" ? (
        <StripArranger
          ids={profile.carouselIds}
          photos={photos}
          pool={pool}
          feedError={feedError}
          onPool={setPool}
          onToggle={addOrRemove}
          onMove={(from, to) => updateCarousel(moveCarouselId(profile.carouselIds, from, to))}
          onDone={() => {
            setIndex(0);
            setMode("page");
          }}
        />
      ) : null}
      {openPhoto ? <FrameDialog photo={openPhoto} onClose={() => setOpenId(null)} /> : null}
      </div>
    </div>
  );
}

function ProfilePage({
  profile,
  photos,
  feedError,
  index,
  onIndex,
  onEdit,
  onArrange,
  onOpen,
}: {
  profile: Profile;
  photos: FeedItem[];
  feedError: string;
  index: number;
  onIndex: (index: number) => void;
  onEdit: () => void;
  onArrange: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <IdentityCard profile={profile} onEditPhoto={onEdit} />
      <button className="ghost profile-edit" type="button" onClick={onEdit}>
        Edit profile
      </button>
      <div className="strip-head">
        <h2 className="section">Carousel</h2>
        <p className="fine">
          {profile.carouselIds.length} of {CAROUSEL_LIMIT}
        </p>
      </div>
      {feedError ? <p className="error">{feedError}</p> : null}
      {profile.carouselIds.length === 0 ? (
        <div className="empty">
          <h2>Nothing on the strip.</h2>
          <p>Pick up to {CAROUSEL_LIMIT} photos and put them in the order you want them to play.</p>
        </div>
      ) : (
        <Carousel ids={profile.carouselIds} photos={photos} index={index} onIndex={onIndex} onOpen={onOpen} />
      )}
      <button className="primary profile-arrange" type="button" onClick={onArrange}>
        Arrange the strip
      </button>
    </>
  );
}

function IdentityCard({ profile, onEditPhoto }: { profile: Profile; onEditPhoto?: () => void }) {
  const portrait = <Portrait profile={profile} />;
  return (
    <figure className="print identity">
      {onEditPhoto ? (
        <button className="frame" type="button" onClick={onEditPhoto} aria-label="Edit profile photo">
          {portrait}
        </button>
      ) : (
        portrait
      )}
      <h2 className={`caption${profile.username ? "" : " is-placeholder"}`} data-profile-name={profile.username}>
        {profile.username || "Your name"}
      </h2>
      <p className="marks">
        {profile.emojis.map((emoji, slot) => (
          <span key={slot}>{emoji || "·"}</span>
        ))}
      </p>
      <p className="stock-line">RE-LAPSE 400</p>
    </figure>
  );
}

function Portrait({ profile }: { profile: Profile }) {
  if (profile.avatarDataUrl) {
    return <img src={profile.avatarDataUrl} alt="" />;
  }
  if (profile.avatarPhotoId) {
    return <FrameImage id={profile.avatarPhotoId} alt="" missing="Missing" />;
  }
  if (profile.avatarUrl) {
    return <img src={profile.avatarUrl} alt="" />;
  }
  return (
    <div className="portrait-empty" aria-hidden="true">
      Add a photo
    </div>
  );
}

function FrameImage({ id, alt, missing }: { id: string; alt: string; missing: string }) {
  const [dead, setDead] = useState(false);
  if (dead) return <div className="gone-frame">{missing}</div>;
  return <img src={`/api/photos/${id}/image`} alt={alt} onError={() => setDead(true)} />;
}

function Carousel({
  ids,
  photos,
  index,
  onIndex,
  onOpen,
}: {
  ids: string[];
  photos: FeedItem[];
  index: number;
  onIndex: (index: number) => void;
  onOpen: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const lock = useRef(0);
  const safeIndex = Math.min(index, Math.max(0, ids.length - 1));
  const caption = captionFor(ids[safeIndex] ?? "", photos);

  function go(next: number) {
    const track = trackRef.current;
    const bounded = Math.max(0, Math.min(ids.length - 1, next));
    const slide = track?.children[bounded] as HTMLElement | undefined;
    if (track && slide) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) lock.current = Date.now() + 450;
      track.scrollTo({ left: slide.offsetLeft, behavior: reduced ? "auto" : "smooth" });
    }
    onIndex(bounded);
  }

  function onScroll() {
    if (Date.now() < lock.current) return;
    const track = trackRef.current;
    if (!track) return;
    const origin = track.scrollLeft;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    [...track.children].forEach((child, childIndex) => {
      const slide = child as HTMLElement;
      const distance = Math.abs(slide.offsetLeft - origin);
      if (distance < bestDistance) {
        best = childIndex;
        bestDistance = distance;
      }
    });
    if (best !== safeIndex) onIndex(best);
  }

  return (
    <div
      className="carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Profile photos"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          go(safeIndex + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(safeIndex - 1);
        }
      }}
    >
      <div className="carousel-track" ref={trackRef} onScroll={onScroll}>
        {ids.map((id, slideIndex) => (
          <button
            key={id}
            className="carousel-slide"
            type="button"
            data-frame-id={id}
            aria-label={`Open ${captionFor(id, photos)}, frame ${slideIndex + 1} of ${ids.length}`}
            aria-current={slideIndex === safeIndex ? "true" : undefined}
            onClick={() => onOpen(id)}
          >
            <FrameImage id={id} alt="" missing="Left the lab" />
          </button>
        ))}
      </div>
      <div className="carousel-nav">
        <button className="ghost" type="button" onClick={() => go(safeIndex - 1)} disabled={safeIndex === 0}>
          Prev
        </button>
        <p className="fine" aria-live="polite">
          {safeIndex + 1} of {ids.length}
        </p>
        <button
          className="ghost"
          type="button"
          onClick={() => go(safeIndex + 1)}
          disabled={safeIndex >= ids.length - 1}
        >
          Next
        </button>
      </div>
      <div className="ticks" aria-hidden="true">
        {ids.map((id, tick) => (
          <button
            key={id}
            type="button"
            tabIndex={-1}
            aria-current={tick === safeIndex ? "true" : undefined}
            onClick={() => go(tick)}
          />
        ))}
      </div>
      {caption !== "Frame" ? <p className="fine carousel-caption">{caption}</p> : null}
    </div>
  );
}

function ProfileEditor({
  draft,
  saved,
  photos,
  feedError,
  activeSlot,
  typed,
  typedHint,
  reading,
  moreFrames,
  onDraft,
  onSlot,
  onTyped,
  onTypedHint,
  onChoose,
  onFile,
  onMore,
  onBack,
  onSave,
  busy,
}: {
  draft: Profile;
  saved: boolean;
  photos: FeedItem[];
  feedError: string;
  activeSlot: number;
  typed: string;
  typedHint: string;
  reading: boolean;
  moreFrames: boolean;
  onDraft: (profile: Profile) => void;
  onSlot: (slot: number) => void;
  onTyped: (value: string) => void;
  onTypedHint: (value: string) => void;
  onChoose: (emoji: string) => void;
  onFile: (file: File | undefined) => void;
  onMore: () => void;
  onBack: () => void;
  onSave: (event: FormEvent) => void;
  busy: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const frames = moreFrames ? photos : photos.slice(0, 12);
  const ready = profileReady(draft);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <form className="profile-form" onSubmit={onSave}>
      {saved ? (
        <button className="ghost back" type="button" onClick={onBack}>
          ← Profile
        </button>
      ) : (
        <p className="fine">Anyone on the feed can open this. A name, a photo, and three emojis that describe you.</p>
      )}
      <div aria-hidden="true">
        <IdentityCard profile={draft} />
      </div>
      <label className="kicker" htmlFor="profile-name">
        Name
      </label>
      <input
        id="profile-name"
        ref={nameRef}
        className="field"
        maxLength={NAME_LIMIT}
        autoComplete="nickname"
        placeholder="Your name"
        value={draft.username}
        onChange={(event) => {
          const username = event.target.value
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .replace(/^\s+/, "")
            .replace(/\s+/g, " ")
            .slice(0, NAME_LIMIT);
          onDraft({ ...draft, username });
        }}
      />
      <p className="count">
        {draft.username.trim().length}/{NAME_LIMIT}
      </p>

      <p className="kicker" id="portrait-label">
        Profile photo
      </p>
      <button
        className="primary"
        type="button"
        disabled={reading}
        aria-describedby="portrait-label"
        onClick={() => fileRef.current?.click()}
      >
        {reading ? "Reading…" : "Choose a photo"}
      </button>
      <input
        ref={fileRef}
        className="file"
        type="file"
        accept="image/*"
        aria-label="Choose a profile photo from this device"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          onFile(file);
        }}
      />
      {draft.avatarDataUrl || draft.avatarPhotoId || draft.avatarUrl ? (
        <button
          className="ghost"
          type="button"
          onClick={() => onDraft({ ...draft, avatarDataUrl: null, avatarPhotoId: null, avatarUrl: null })}
        >
          Remove photo
        </button>
      ) : null}
      <p className="fine">Or use a frame from the feed.</p>
      {feedError ? <p className="error">{feedError}</p> : null}
      {photos.length === 0 ? (
        <p className="fine">Nothing shared yet. Develop a frame and send it, or use a photo from this device.</p>
      ) : (
        <>
          <div className="pick-grid" role="group" aria-label="Frames for your profile photo">
            {frames.map((photo) => {
              const selected = draft.avatarPhotoId === photo.id && !draft.avatarDataUrl;
              const label = photo.caption.trim() || "Untitled frame";
              return (
                <button
                  key={photo.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={selected ? `Remove ${label} as profile photo` : `Use ${label} as profile photo`}
                  onClick={() =>
                    onDraft({
                      ...draft,
                      avatarPhotoId: selected ? null : photo.id,
                      avatarDataUrl: null,
                      avatarUrl: null,
                    })
                  }
                >
                  <img src={`/api/photos/${photo.id}/image`} alt="" />
                </button>
              );
            })}
          </div>
          {!moreFrames && photos.length > 12 ? (
            <button className="ghost" type="button" onClick={onMore}>
              More frames
            </button>
          ) : null}
        </>
      )}

      <p className="kicker" id="emoji-help">
        Three emojis
      </p>
      <p className="fine" id="emoji-detail">
        Pick three that describe you.
      </p>
      <div className="emoji-slots" role="group" aria-describedby="emoji-detail">
        {draft.emojis.map((emoji, slot) => (
          <button
            key={slot}
            type="button"
            aria-pressed={activeSlot === slot}
            aria-label={emoji ? `Emoji ${slot + 1}, ${emoji}` : `Choose emoji ${slot + 1}`}
            onClick={() => onSlot(slot)}
          >
            {emoji || "+"}
          </button>
        ))}
      </div>
      <label className="fine" htmlFor="emoji-type">
        Or type one
      </label>
      <input
        id="emoji-type"
        className="field emoji-type"
        value={typed}
        maxLength={16}
        autoComplete="off"
        aria-label="Type an emoji"
        onChange={(event) => {
          const value = event.target.value;
          const emoji = takeEmoji(value);
          if (emoji) {
            onChoose(emoji);
            return;
          }
          onTyped(value.slice(0, 16));
          onTypedHint(value.trim() ? "That isn't an emoji." : "");
        }}
      />
      {typedHint ? <p className="error">{typedHint}</p> : null}
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="kicker">{group.label}</p>
          <div className="emoji-grid">
            {group.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Use ${emoji}`}
                aria-pressed={draft.emojis.includes(emoji)}
                onClick={() => onChoose(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="primary profile-save" type="submit" disabled={!ready || busy}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function StripArranger({
  ids,
  photos,
  pool,
  feedError,
  onPool,
  onToggle,
  onMove,
  onDone,
}: {
  ids: string[];
  photos: FeedItem[];
  pool: "all" | "mine";
  feedError: string;
  onPool: (pool: "all" | "mine") => void;
  onToggle: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onDone: () => void;
}) {
  const [over, setOver] = useState<number | null>(null);
  const poolPhotos = pool === "mine" ? photos.filter((photo) => photo.mine) : photos;
  const chosen = new Set(ids);

  return (
    <>
      <button className="ghost back" type="button" onClick={onDone}>
        ← Profile
      </button>
      <h2 className="section">The strip</h2>
      <p className="fine">
        Up to {CAROUSEL_LIMIT} frames. The first one plays first. {ids.length} of {CAROUSEL_LIMIT} chosen.
      </p>
      {ids.length === 0 ? (
        <p className="fine">Nothing on the strip yet.</p>
      ) : (
        <ol className="order-list">
          {ids.map((id, position) => {
            const label = captionFor(id, photos);
            return (
              <li
                key={id}
                className={`order-row${over === position ? " is-over" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(position);
                }}
                onDragLeave={() => setOver((current) => (current === position ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = Number(event.dataTransfer.getData("text/plain"));
                  setOver(null);
                  if (Number.isInteger(from)) onMove(from, position);
                }}
              >
                <FrameImage id={id} alt="" missing="Left the lab" />
                <div className="order-copy">
                  <strong>
                    {position + 1}. {label}
                  </strong>
                  <div className="order-actions">
                    <span
                      className="drag-handle"
                      draggable
                      aria-hidden="true"
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", String(position));
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      Drag
                    </span>
                    <button type="button" aria-label={`Move ${label} earlier`} disabled={position === 0} onClick={() => onMove(position, position - 1)}>
                      Earlier
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${label} later`}
                      disabled={position === ids.length - 1}
                      onClick={() => onMove(position, position + 1)}
                    >
                      Later
                    </button>
                    <button type="button" aria-label={`Remove ${label} from the strip`} onClick={() => onToggle(id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <h2 className="section">Add a frame</h2>
      <div className="segmented" role="group" aria-label="Which frames to choose from">
        <button type="button" aria-pressed={pool === "all"} onClick={() => onPool("all")}>
          Everyone
        </button>
        <button type="button" aria-pressed={pool === "mine"} onClick={() => onPool("mine")}>
          Yours
        </button>
      </div>
      {ids.length >= CAROUSEL_LIMIT ? (
        <p className="error">The strip holds {CAROUSEL_LIMIT} frames. Remove one first.</p>
      ) : null}
      {feedError ? <p className="error">{feedError}</p> : null}
      {poolPhotos.length === 0 ? (
        <div className="empty">
          <h2>{pool === "mine" ? "No frames of yours." : "No frames to add."}</h2>
          <p>
            {pool === "mine"
              ? "You haven't shared a frame yet."
              : "Develop a frame and send it to the feed. Then it can go on your strip."}
          </p>
        </div>
      ) : (
        <div className="pick-grid">
          {poolPhotos.map((photo) => {
            const selected = chosen.has(photo.id);
            const position = ids.indexOf(photo.id);
            const label = photo.caption.trim() || "Untitled frame";
            const full = !selected && ids.length >= CAROUSEL_LIMIT;
            return (
              <button
                key={photo.id}
                type="button"
                aria-pressed={selected}
                aria-label={
                  selected
                    ? `Remove ${label} from the strip, position ${position + 1}`
                    : full
                      ? `${label} not added, strip is full`
                      : `Add ${label} to the strip`
                }
                onClick={() => onToggle(photo.id)}
              >
                <img src={`/api/photos/${photo.id}/image`} alt="" />
                {selected ? <span className="pick-badge">{position + 1}</span> : null}
              </button>
            );
          })}
        </div>
      )}
      <button className="primary profile-arrange" type="button" onClick={onDone}>
        Done
      </button>
    </>
  );
}

function FrameDialog({
  photo,
  onClose,
}: {
  photo: { id: string; caption: string };
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={photo.caption || "Frame"} onClick={onClose}>
      <figure className="print" onClick={(event) => event.stopPropagation()}>
        <FrameImage id={photo.id} alt={photo.caption || "Profile frame"} missing="Left the lab" />
        {photo.caption ? <figcaption className="caption">{photo.caption}</figcaption> : null}
      </figure>
      <button ref={closeRef} className="ghost" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export function GuestProfile({
  id,
  onBack,
  load = fetchPublicProfile,
}: {
  id: string;
  onBack: () => void;
  load?: (id: string) => Promise<SharedProfile>;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    setProfile(null);
    setError("");
    setIndex(0);
    load(id)
      .then((row) => {
        if (!stop) setProfile(profileFromServer(row));
      })
      .catch((err: unknown) => {
        if (!stop) setError(err instanceof Error ? err.message : "That profile is gone.");
      });
    return () => {
      stop = true;
    };
  }, [id, load]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const openPhoto = openId ? { id: openId, caption: "" } : null;

  return (
    <div className="scroll" data-screen="guest-profile">
      <button className="ghost back" type="button" onClick={onBack}>
        ← Back
      </button>
      {error ? <p className="error">{error}</p> : null}
      {profile ? (
        <>
          <IdentityCard profile={profile} />
          <div className="strip-head">
            <h2 className="section">Carousel</h2>
            <p className="fine">
              {profile.carouselIds.length} of {CAROUSEL_LIMIT}
            </p>
          </div>
          {profile.carouselIds.length === 0 ? (
            <div className="empty">
              <h2>Nothing on the strip.</h2>
              <p>They haven't picked frames yet.</p>
            </div>
          ) : (
            <Carousel ids={profile.carouselIds} photos={[]} index={index} onIndex={setIndex} onOpen={setOpenId} />
          )}
        </>
      ) : null}
      {openPhoto ? <FrameDialog photo={openPhoto} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
