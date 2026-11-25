"use client";

import { useEffect, useRef, useState } from "react";
import {
  createAlbum,
  createEvent,
  deletePhoto,
  fetchAlbums,
  fetchEvent,
  fetchEvents,
  inviteToEvent,
  joinEvent,
  publishEventFeed,
} from "@/lib/api";
import { Gallery, GalleryCardButton } from "@/components/Gallery";
import { PhotoStrip, StripShot } from "@/components/PhotoStrip";
import { clockLabel, frames, longRemain } from "@/lib/format";
import type { Album, EventDetail, EventRoll, EventStatus, FeedItem } from "@/lib/types";
import { Lightbox, PrintView } from "@/components/Print";

function statusLine(event: EventRoll, now: number): string {
  if (event.status === "open") return `Open · ${longRemain(Math.max(0, event.endsAt - now))} left`;
  if (event.status === "sealing") return `Sealing · back in ${longRemain(Math.max(0, event.revealAt - now))}`;
  return "Ready · the timecapsule is back";
}

function eventMeta(event: EventRoll): string {
  const camera = `${event.durationHours}-hour camera`;
  const people =
    event.inviteOnly && event.memberCount > 0
      ? `${event.memberCount} ${event.memberCount === 1 ? "person" : "people"}`
      : "";
  if (event.status !== "ready" || event.frameCount == null) {
    return people ? `${camera} · ${people}` : camera;
  }
  return [camera, frames(event.frameCount), people].filter(Boolean).join(" · ");
}

function inviteBlurb(status: EventStatus): string {
  if (status === "open") return "Invite other people. Anyone who joins can add frames until this timecapsule closes.";
  if (status === "sealing") return "The window is closed. People you invite can still watch for the timecapsule to come back.";
  return "Share this if someone should see the whole timecapsule. The feed only gets the frames you pick.";
}

function memberLine(event: EventDetail): string {
  if (event.memberCount <= 1) return "Just you, until someone joins.";
  const names = event.members.map((member) => member.name).filter((name): name is string => Boolean(name));
  const shown = names.slice(0, 4);
  const rest = event.memberCount - shown.length;
  if (shown.length === 0) return `${event.memberCount} people on this timecapsule.`;
  if (rest > 0) return `${shown.join(", ")}, and ${rest} more.`;
  return shown.join(", ");
}

function picksMatch(photos: FeedItem[], picked: Set<string>): boolean {
  const onFeed = photos.filter((photo) => photo.onFeed);
  if (onFeed.length !== picked.size) return false;
  return onFeed.every((photo) => picked.has(photo.id));
}

function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("join", code);
  return url.toString();
}

export function Rolls({
  revision,
  refresh = 0,
  focusEventId,
  joinNotice,
  onArm,
  onOpenProfile,
  onShared,
  onFocusConsumed,
}: {
  revision: number;
  refresh?: number;
  focusEventId?: string | null;
  joinNotice?: string;
  onArm: (event: EventRoll) => void;
  onOpenProfile: (id: string) => void;
  onShared?: () => void;
  onFocusConsumed?: () => void;
}) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [events, setEvents] = useState<EventRoll[]>([]);
  const [albumName, setAlbumName] = useState("");
  const [eventName, setEventName] = useState("");
  const [hours, setHours] = useState(12);
  const [joinCode, setJoinCode] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const removed = useRef(new Set<string>());
  const pickDirty = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [rolls, cameras] = await Promise.all([fetchAlbums(), fetchEvents()]);
        if (stop) return;
        setAlbums(rolls);
        setEvents(cameras);
        setError("");
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [revision, refresh, tick]);

  const watchedEvent = eventDetail?.id ?? null;
  useEffect(() => {
    if (!watchedEvent) return;
    let stop = false;
    const pull = () => {
      void fetchEvent(watchedEvent)
        .then((detail) => {
          if (stop) return;
          setEventDetail({
            ...detail,
            photos: detail.photos.filter((photo) => !removed.current.has(photo.id)),
          });
        })
        .catch(() => undefined);
    };
    pull();
    const id = window.setInterval(pull, 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [watchedEvent, revision, refresh]);

  const detailKey = eventDetail?.id ?? "";
  useEffect(() => {
    pickDirty.current = false;
  }, [detailKey]);

  useEffect(() => {
    if (!eventDetail || pickDirty.current) return;
    setPicked(new Set(eventDetail.photos.filter((photo) => photo.onFeed).map((photo) => photo.id)));
  }, [eventDetail]);

  useEffect(() => {
    if (!focusEventId) return;
    void showEvent(focusEventId);
    onFocusConsumed?.();
  }, [focusEventId]);

  async function makeAlbum() {
    if (!albumName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const album = await createAlbum(albumName.trim());
      setAlbums((current) => [album, ...current]);
      setAlbumName("");
      setGalleryId(album.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start that gallery.");
    } finally {
      setBusy(false);
    }
  }

  async function makeEvent() {
    if (!eventName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const event = await createEvent(eventName.trim(), hours);
      setEvents((current) => [event, ...current]);
      setEventName("");
      setInviteName("");
      setCopied("");
      setEventDetail(await fetchEvent(event.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that timecapsule.");
    } finally {
      setBusy(false);
    }
  }

  async function joinWithCode() {
    const code = joinCode.trim();
    if (!code || busy) return;
    setBusy(true);
    setError("");
    try {
      const event = await joinEvent(code);
      setJoinCode("");
      setInviteName("");
      setCopied("");
      setEventDetail(event);
      setGalleryId(null);
      setTick((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That invite isn't one of ours.");
    } finally {
      setBusy(false);
    }
  }

  async function invitePerson() {
    if (!eventDetail || !inviteName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const event = await inviteToEvent(eventDetail.id, inviteName.trim());
      setInviteName("");
      setEventDetail(event);
      setTick((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't invite them.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("");
      setError("Couldn't copy that. The code is on screen.");
    }
  }

  function togglePick(id: string) {
    pickDirty.current = true;
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveFeed() {
    if (!eventDetail || busy) return;
    const ids = eventDetail.photos.filter((photo) => picked.has(photo.id)).map((photo) => photo.id);
    setBusy(true);
    setError("");
    try {
      const event = await publishEventFeed(eventDetail.id, ids);
      pickDirty.current = false;
      setEventDetail({
        ...event,
        photos: event.photos.filter((photo) => !removed.current.has(photo.id)),
      });
      setPicked(new Set(event.photos.filter((photo) => photo.onFeed).map((photo) => photo.id)));
      onShared?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those frames stayed off the feed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    const eventSnap = eventDetail;
    const opened = open;
    removed.current.add(id);
    setEventDetail((current) =>
      current
        ? {
            ...current,
            frameCount:
              current.frameCount == null
                ? null
                : Math.max(0, current.frameCount - (current.photos.some((photo) => photo.id === id) ? 1 : 0)),
            photos: current.photos.filter((photo) => photo.id !== id),
          }
        : current,
    );
    setPicked((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (open?.id === id) setOpen(null);
    try {
      await deletePhoto(id);
      setTick((value) => value + 1);
    } catch (err) {
      removed.current.delete(id);
      setEventDetail(eventSnap);
      setOpen(opened);
      setError(err instanceof Error ? err.message : "That frame stayed put.");
      throw err;
    }
  }

  function showAlbum(id: string) {
    setError("");
    setEventDetail(null);
    setGalleryId(id);
  }

  async function showEvent(id: string) {
    setError("");
    try {
      setInviteName("");
      setCopied("");
      setEventDetail(await fetchEvent(id));
      setGalleryId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That timecapsule is gone.");
    }
  }

  if (galleryId) {
    return (
      <Gallery
        id={galleryId}
        refresh={refresh + revision}
        place="keepsakes"
        onBack={() => {
          setGalleryId(null);
          setTick((value) => value + 1);
        }}
        onOpenProfile={onOpenProfile}
        onChanged={() => setTick((value) => value + 1)}
      />
    );
  }

  if (eventDetail) {
    const line = statusLine(eventDetail, now);
    const chosen = eventDetail.photos.filter((photo) => picked.has(photo.id)).length;
    const feedReady = eventDetail.inviteOnly && eventDetail.owner && eventDetail.status === "ready" && eventDetail.photos.length > 0;
    const feedLabel = chosen === 0 ? "Keep the feed clear" : `Add ${chosen} ${chosen === 1 ? "frame" : "frames"} to the feed`;
    return (
      <div className="scroll" data-screen="event" data-status={eventDetail.status} data-invite-only={eventDetail.inviteOnly ? "yes" : "no"}>
        <button
          className="ghost back"
          type="button"
          onClick={() => {
            setEventDetail(null);
            setTick((value) => value + 1);
          }}
        >
          ← Keepsakes
        </button>
        <span className="pill" data-status={eventDetail.status}>{line}</span>
        <h2 className="word" style={{ fontSize: 40, marginTop: 10 }}>{eventDetail.name}</h2>
        <p className="fine">{eventMeta(eventDetail)}</p>
        <div className="phases">
          <Phase label="Open" detail={`until ${clockLabel(eventDetail.endsAt)}`} on={eventDetail.status === "open"} />
          <Phase label="Sealing" detail={`until ${clockLabel(eventDetail.revealAt)}`} on={eventDetail.status === "sealing"} />
          <Phase label="Ready" detail={eventDetail.inviteOnly ? "pick the feed" : "the timecapsule returns"} on={eventDetail.status === "ready"} />
        </div>
        {eventDetail.inviteOnly && eventDetail.owner ? (
          <section className="invite" data-invite>
            <h2 className="section">Invite</h2>
            <p className="fine">{inviteBlurb(eventDetail.status)}</p>
            {eventDetail.inviteCode ? (
              <div className="invite-code" data-invite-code>{eventDetail.inviteCode}</div>
            ) : null}
            {eventDetail.inviteCode ? (
              <div className="invite-actions">
                <button className="ghost" type="button" onClick={() => void copyText("code", eventDetail.inviteCode ?? "")}>
                  Copy code
                </button>
                <button className="ghost" type="button" onClick={() => void copyText("link", inviteLink(eventDetail.inviteCode ?? ""))}>
                  Copy link
                </button>
              </div>
            ) : null}
            {copied ? <p className="fine">Copied the {copied}.</p> : null}
            <div className="row" style={{ marginTop: 12 }}>
              <input
                className="field"
                maxLength={24}
                placeholder="Their name"
                value={inviteName}
                data-invite-name
                onChange={(event) => setInviteName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void invitePerson();
                }}
              />
              <button className="primary" type="button" disabled={busy || !inviteName.trim()} onClick={() => void invitePerson()}>
                Invite
              </button>
            </div>
            <p className="fine" style={{ marginTop: 8 }}>{memberLine(eventDetail)}</p>
          </section>
        ) : null}
        {eventDetail.inviteOnly && !eventDetail.owner && eventDetail.status === "open" ? (
          <p className="fine">You're invited. Add frames until this timecapsule closes.</p>
        ) : null}
        {eventDetail.status === "open" ? (
          <button className="primary" type="button" data-arm-event={eventDetail.id} onClick={() => onArm(eventDetail)}>
            Shoot this timecapsule
          </button>
        ) : null}
        {eventDetail.status === "sealing" ? (
          <div className="empty">
            <h2>At the lab.</h2>
            <p>The window is closed. Nothing from this timecapsule is viewable until the seal breaks.</p>
          </div>
        ) : null}
        {eventDetail.status === "ready" && eventDetail.photos.length === 0 ? (
          <div className="empty">
            <h2>The timecapsule came back empty. 🎞️</h2>
            <p>Nobody shot this one.</p>
          </div>
        ) : null}
        {eventDetail.status === "ready" && eventDetail.photos.length > 0 ? (
          <>
            {eventDetail.inviteOnly && !eventDetail.owner ? (
              <p className="fine">The timecapsule is back. Frames on the feed are the ones everyone can see.</p>
            ) : null}
            <p className="section">In the order they were shot</p>
            {feedReady ? (
              <PhotoStrip name="feed-picks" label="Frames in this timecapsule">
                {eventDetail.photos.map((photo) => {
                  const caption = photo.caption.trim();
                  return (
                    <div className="photo-strip-card" role="listitem" key={photo.id} data-roll-frame={photo.id}>
                      <StripShot
                        id={photo.id}
                        label={caption ? `Open ${caption}` : "Open frame"}
                        onOpen={() => setOpen(photo)}
                      />
                      {caption ? <span className="photo-strip-caption">{caption}</span> : null}
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={picked.has(photo.id)}
                          data-feed-pick={photo.id}
                          aria-label={caption ? `Add ${caption} to the feed` : "Add this frame to the feed"}
                          onChange={() => togglePick(photo.id)}
                        />
                        Feed
                      </label>
                    </div>
                  );
                })}
              </PhotoStrip>
            ) : (
              <div className="thread">
                {eventDetail.photos.map((photo) => (
                  <div className="roll-frame" key={photo.id} data-roll-frame={photo.id}>
                    {eventDetail.inviteOnly ? (
                      <div className="roll-frame-bar">
                        <span className="pill" data-status={photo.onFeed ? "ready" : undefined}>
                          {photo.onFeed ? "On the feed" : "Held back"}
                        </span>
                      </div>
                    ) : null}
                    <PrintView
                      item={photo}
                      onOpen={setOpen}
                      onOpenProfile={onOpenProfile}
                      onDelete={onDelete}
                    />
                  </div>
                ))}
              </div>
            )}
            {feedReady ? (
              <button
                className="primary"
                type="button"
                data-save-feed={eventDetail.id}
                style={{ marginTop: 4 }}
                disabled={busy || picksMatch(eventDetail.photos, picked)}
                onClick={() => void saveFeed()}
              >
                {busy ? "Sending…" : feedLabel}
              </button>
            ) : null}
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {open ? (
          <Lightbox item={open} onClose={() => setOpen(null)} onOpenProfile={onOpenProfile} onDelete={onDelete} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="scroll" data-screen="keepsakes">
      <p className="fine">
        Keepsakes are galleries of your photos. Timecapsules stay open for 1 to 24 hours, then the whole album seals for a day. Invite people onto it, and pick what hits the feed.
      </p>
      {error || joinNotice ? <p className="error">{error || joinNotice}</p> : null}
      <h2 className="section">Galleries</h2>
      <div className="row">
        <input
          className="field"
          maxLength={40}
          placeholder="Album title"
          value={albumName}
          onChange={(event) => setAlbumName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void makeAlbum();
          }}
        />
        <button className="primary" type="button" disabled={busy || !albumName.trim()} onClick={() => void makeAlbum()}>
          Make
        </button>
      </div>
      {albums.length === 0 ? (
        <div className="empty">
          <h2>No galleries yet. 🎞️</h2>
          <p>Name one, send a photo to the feed, then add it here.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {albums.map((album) => (
            <GalleryCardButton key={album.id} gallery={album} onOpen={() => showAlbum(album.id)} />
          ))}
        </div>
      )}
      <h2 className="section">Timecapsules</h2>
      <input
        className="field"
        maxLength={40}
        placeholder="Timecapsule name"
        value={eventName}
        onChange={(event) => setEventName(event.target.value)}
      />
      <div className="stepper">
        <button type="button" aria-label="Shorter timecapsule" onClick={() => setHours((value) => Math.max(1, value - 1))}>
          –
        </button>
        <div className="hours" data-hours={hours}>
          {hours}
          <span>{hours === 1 ? "hour" : "hours"}</span>
        </div>
        <button type="button" aria-label="Longer timecapsule" onClick={() => setHours((value) => Math.min(24, value + 1))}>
          +
        </button>
      </div>
      <p className="fine">Open for 1 to 24 hours. When it closes, the timecapsule seals for 24 hours. Then you choose which frames go on the feed.</p>
      <button className="primary" type="button" style={{ marginTop: 12 }} disabled={busy || !eventName.trim()} onClick={() => void makeEvent()}>
        Start the timecapsule
      </button>
      <h2 className="section">Join</h2>
      <div className="row">
        <input
          className="field"
          maxLength={8}
          placeholder="Invite code"
          value={joinCode}
          data-join-code
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === "Enter") void joinWithCode();
          }}
        />
        <button className="primary" type="button" disabled={busy || joinCode.trim().length < 6} onClick={() => void joinWithCode()}>
          Join
        </button>
      </div>
      <div style={{ height: 14 }} />
      {events.length === 0 ? (
        <div className="empty">
          <h2>No timecapsules yet. 🎉</h2>
          <p>Start one, invite people, and they can add frames until it closes.</p>
        </div>
      ) : (
        events.map((event) => (
          <button className="event" type="button" key={event.id} data-status={event.status} onClick={() => void showEvent(event.id)}>
            <span className="pill" data-status={event.status}>{statusLine(event, now)}</span>
            <h3>{event.name}</h3>
            <p>{eventMeta(event)}</p>
          </button>
        ))
      )}
    </div>
  );
}

function Phase({ label, detail, on }: { label: string; detail: string; on: boolean }) {
  return (
    <div className={`phase${on ? " on" : ""}`}>
      <strong>{label}</strong>
      {detail}
    </div>
  );
}

export type { EventStatus };
