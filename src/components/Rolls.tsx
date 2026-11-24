"use client";

import { useEffect, useState } from "react";
import { createAlbum, createEvent, fetchAlbum, fetchAlbums, fetchEvent, fetchEvents } from "@/lib/api";
import { clockLabel, frames, longRemain } from "@/lib/format";
import type { Album, EventDetail, EventRoll, EventStatus, FeedItem } from "@/lib/types";
import { Lightbox, PrintView } from "@/components/Print";

function statusLine(event: EventRoll, now: number): string {
  if (event.status === "open") return `Open · ${longRemain(Math.max(0, event.endsAt - now))} left`;
  if (event.status === "sealing") return `Sealing · back in ${longRemain(Math.max(0, event.revealAt - now))}`;
  return "Ready · the roll is back";
}

export function Rolls({
  revision,
  onArm,
}: {
  revision: number;
  onArm: (event: EventRoll) => void;
}) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [events, setEvents] = useState<EventRoll[]>([]);
  const [albumName, setAlbumName] = useState("");
  const [eventName, setEventName] = useState("");
  const [hours, setHours] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [albumDetail, setAlbumDetail] = useState<{ album: Album; photos: FeedItem[] } | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const [tick, setTick] = useState(0);

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
  }, [revision, tick]);

  const watchedEvent = eventDetail?.id ?? null;
  useEffect(() => {
    if (!watchedEvent) return;
    const id = window.setInterval(() => {
      void fetchEvent(watchedEvent).then(setEventDetail).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
  }, [watchedEvent]);

  async function makeAlbum() {
    if (!albumName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const album = await createAlbum(albumName.trim());
      setAlbums((current) => [album, ...current]);
      setAlbumName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start that roll.");
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
      setEventDetail(await fetchEvent(event.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that event.");
    } finally {
      setBusy(false);
    }
  }

  async function showAlbum(id: string) {
    setError("");
    try {
      setAlbumDetail(await fetchAlbum(id));
      setEventDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That roll is gone.");
    }
  }

  async function showEvent(id: string) {
    setError("");
    try {
      setEventDetail(await fetchEvent(id));
      setAlbumDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That event is gone.");
    }
  }

  if (albumDetail) {
    return (
      <div className="scroll" data-screen="album">
        <button className="ghost back" type="button" onClick={() => setAlbumDetail(null)}>
          ← Rolls
        </button>
        <h2 className="word" style={{ fontSize: 36 }}>{albumDetail.album.name}</h2>
        <p className="fine">{frames(albumDetail.album.frameCount)}</p>
        {albumDetail.photos.length === 0 ? (
          <div className="empty">
            <h2>Empty roll.</h2>
            <p>Develop a frame, then file it here from the feed.</p>
          </div>
        ) : (
          <div className="grid">
            {albumDetail.photos.map((photo) => (
              <PrintView key={photo.id} item={photo} onOpen={setOpen} compact />
            ))}
          </div>
        )}
        {open ? <Lightbox item={open} onClose={() => setOpen(null)} /> : null}
      </div>
    );
  }

  if (eventDetail) {
    const line = statusLine(eventDetail, now);
    return (
      <div className="scroll" data-screen="event" data-status={eventDetail.status}>
        <button
          className="ghost back"
          type="button"
          onClick={() => {
            setEventDetail(null);
            setTick((value) => value + 1);
          }}
        >
          ← Rolls
        </button>
        <span className="pill" data-status={eventDetail.status}>{line}</span>
        <h2 className="word" style={{ fontSize: 40, marginTop: 10 }}>{eventDetail.name}</h2>
        <p className="fine">{eventDetail.durationHours}-hour camera · {frames(eventDetail.frameCount)}</p>
        <div className="phases">
          <Phase label="Open" detail={`until ${clockLabel(eventDetail.endsAt)}`} on={eventDetail.status === "open"} />
          <Phase label="Sealing" detail={`until ${clockLabel(eventDetail.revealAt)}`} on={eventDetail.status === "sealing"} />
          <Phase label="Ready" detail="the roll returns" on={eventDetail.status === "ready"} />
        </div>
        {eventDetail.status === "open" ? (
          <button className="primary" type="button" data-arm-event={eventDetail.id} onClick={() => onArm(eventDetail)}>
            Shoot this event
          </button>
        ) : null}
        {eventDetail.status === "sealing" ? (
          <div className="empty">
            <h2>At the lab.</h2>
            <p>The window is closed. Nothing from this event is viewable until the seal breaks.</p>
          </div>
        ) : null}
        {eventDetail.status === "ready" && eventDetail.photos.length === 0 ? (
          <div className="empty">
            <h2>The roll came back empty.</h2>
            <p>Nobody shot this one.</p>
          </div>
        ) : null}
        {eventDetail.status === "ready" && eventDetail.photos.length > 0 ? (
          <>
            <p className="section">In the order they were shot</p>
            <div className="thread">
              {eventDetail.photos.map((photo) => (
                <PrintView key={photo.id} item={photo} onOpen={setOpen} />
              ))}
            </div>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {open ? <Lightbox item={open} onClose={() => setOpen(null)} /> : null}
      </div>
    );
  }

  return (
    <div className="scroll" data-screen="rolls">
      <p className="fine">
        Rolls are named stacks of developed frames. Events are cameras that stay open for a set time, then seal for a day.
      </p>
      {error ? <p className="error">{error}</p> : null}
      <h2 className="section">Rolls</h2>
      <div className="row">
        <input
          className="field"
          maxLength={40}
          placeholder="Name a roll"
          value={albumName}
          onChange={(event) => setAlbumName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void makeAlbum();
          }}
        />
        <button className="primary" type="button" disabled={busy || !albumName.trim()} onClick={() => void makeAlbum()}>
          File
        </button>
      </div>
      {albums.length === 0 ? (
        <div className="empty">
          <h2>No rolls yet.</h2>
          <p>Name one, develop a frame, then file it from the feed.</p>
        </div>
      ) : (
        albums.map((album) => (
          <button className="roll" type="button" key={album.id} onClick={() => void showAlbum(album.id)}>
            <h3>{album.name}</h3>
            <p>{frames(album.frameCount)}</p>
          </button>
        ))
      )}
      <h2 className="section">Events</h2>
      <input
        className="field"
        maxLength={40}
        placeholder="Event name"
        value={eventName}
        onChange={(event) => setEventName(event.target.value)}
      />
      <div className="stepper">
        <button type="button" aria-label="Shorter event" onClick={() => setHours((value) => Math.max(8, value - 1))}>
          –
        </button>
        <div className="hours">
          {hours}
          <span>hours</span>
        </div>
        <button type="button" aria-label="Longer event" onClick={() => setHours((value) => Math.min(24, value + 1))}>
          +
        </button>
      </div>
      <p className="fine">Open for 8 to 24 hours. When it closes, the roll seals for 24 hours. Then everyone can see it.</p>
      <button className="primary" type="button" style={{ marginTop: 12 }} disabled={busy || !eventName.trim()} onClick={() => void makeEvent()}>
        Start the event
      </button>
      <div style={{ height: 14 }} />
      {events.length === 0 ? (
        <div className="empty">
          <h2>No events yet.</h2>
          <p>Start one and everybody with the link can shoot until it closes.</p>
        </div>
      ) : (
        events.map((event) => (
          <button className="event" type="button" key={event.id} data-status={event.status} onClick={() => void showEvent(event.id)}>
            <span className="pill" data-status={event.status}>{statusLine(event, now)}</span>
            <h3>{event.name}</h3>
            <p>{event.durationHours}-hour camera · {frames(event.frameCount)}</p>
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
