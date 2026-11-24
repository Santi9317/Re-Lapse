import { randomUUID } from "node:crypto";
import { devClockRequested, eventTimes, FEED_DAYS, personalReadyAt } from "@/lib/clock";
import { sql } from "@/lib/db";
import type { Album, EventDetail, EventRoll, EventStatus, FeedItem, LabItem, LabState } from "@/lib/types";
import { HttpError } from "@/server/http";
import { assertCreateAllowed, noteCreate } from "@/server/quota";
import { cleanJpeg } from "@/server/validate";

// Storage ceilings, not permanent locks. A shared frame stays on the feed for
// a week and is then deleted. Expired rows are removed, and a full table drops
// the oldest row so a visitor cannot fill the lab forever.
const PHOTO_CAP = 500;
const ALBUM_CAP = 200;
const EVENT_CAP = 200;

let lastReclaim = 0;

// FEED_DAYS is a fixed integer. A shared frame stays this long, then the row
// (and the picture stored on it) is removed.
const feedLifetime = `(${FEED_DAYS} * interval '1 day')`;
const livePersonal = `p.event_id is null and p.published_at is not null and p.published_at >= now() - ${feedLifetime}`;
const liveOnFeed = `(
  (${livePersonal})
  or (p.event_id is not null and e.reveal_at <= now() and e.reveal_at >= now() - ${feedLifetime})
)`;

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function flag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

async function runReclaim(): Promise<void> {
  await sql(
    `delete from photos
     where event_id is null
       and developed_at is null
       and created_at < now() - interval '48 hours'`,
  );
  await sql(
    `delete from photos
     where event_id is null
       and published_at is not null
       and published_at < now() - ${feedLifetime}`,
  );
  await sql(
    `delete from photos
     where event_id is null
       and developed_at is not null
       and published_at is null
       and developed_at < now() - interval '30 days'`,
  );
  await sql(
    `delete from photos
     where event_id in (select id from events where reveal_at < now() - ${feedLifetime})`,
  );
  await sql(`delete from events where reveal_at < now() - ${feedLifetime}`);
  await sql(
    `delete from albums a
     where a.created_at < now() - interval '7 days'
       and not exists (
         select 1 from photos p
         where p.album_id = a.id and p.event_id is null and p.developed_at is not null
       )`,
  );
  await sql(`delete from create_log where created_at < now() - interval '2 hours'`);
}

async function reclaimNow(): Promise<void> {
  lastReclaim = Date.now();
  await runReclaim();
}

async function reclaimSoon(): Promise<void> {
  if (Date.now() - lastReclaim < 60_000) return;
  await reclaimNow();
}

async function countOf(table: "photos" | "albums" | "events"): Promise<number> {
  const query =
    table === "photos"
      ? "select count(*)::int as n from photos"
      : table === "albums"
        ? "select count(*)::int as n from albums"
        : "select count(*)::int as n from events";
  const rows = await sql<{ n: number }>(query);
  return num(rows[0]?.n);
}

async function dropOldestPhoto(): Promise<boolean> {
  const released = await sql<{ id: string }>(
    `delete from photos
     where id = (
       select p.id
       from photos p
       left join events e on e.id = p.event_id
       where (p.event_id is null and p.developed_at is not null)
          or (p.event_id is not null and e.reveal_at <= now())
       order by coalesce(p.developed_at, e.reveal_at) asc, p.created_at asc
       limit 1
     )
     returning id`,
  );
  if (released[0]) return true;
  const oldest = await sql<{ id: string }>(
    `delete from photos
     where id = (select id from photos order by created_at asc limit 1)
     returning id`,
  );
  return Boolean(oldest[0]);
}

async function makePhotoRoom(): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await countOf("photos")) < PHOTO_CAP) return;
    if (!(await dropOldestPhoto())) return;
  }
}

async function makeAlbumRoom(): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await countOf("albums")) < ALBUM_CAP) return;
    const oldest = await sql<{ id: string }>(
      `select id from albums order by created_at asc limit 1`,
    );
    const id = oldest[0]?.id;
    if (!id) return;
    await sql(`update photos set album_id = null where album_id = $1`, [id]);
    await sql(`delete from albums where id = $1`, [id]);
  }
}

async function makeEventRoom(): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await countOf("events")) < EVENT_CAP) return;
    const oldest = await sql<{ id: string }>(
      `select id from events
       order by case when reveal_at <= now() then 0 else 1 end, created_at asc
       limit 1`,
    );
    const id = oldest[0]?.id;
    if (!id) return;
    await sql(`delete from photos where event_id = $1`, [id]);
    await sql(`delete from events where id = $1`, [id]);
  }
}

function feedItem(row: Record<string, unknown>): FeedItem {
  return {
    id: String(row.id),
    caption: String(row.caption ?? ""),
    createdAt: num(row.created_ms),
    developedAt: row.developed_ms == null ? null : num(row.developed_ms),
    sortAt: num(row.sort_ms),
    albumId: text(row.album_id),
    albumName: text(row.album_name),
    eventId: text(row.event_id),
    eventName: text(row.event_name),
    mine: flag(row.mine),
  };
}

const feedSelect = `
  select
    p.id,
    p.caption,
    (extract(epoch from p.created_at) * 1000) as created_ms,
    (extract(epoch from p.developed_at) * 1000) as developed_ms,
    (extract(epoch from coalesce(p.published_at, e.reveal_at)) * 1000) as sort_ms,
    p.album_id,
    a.name as album_name,
    p.event_id,
    e.name as event_name,
    (p.shooter_token = $1) as mine
  from photos p
  left join albums a on a.id = p.album_id
  left join events e on e.id = p.event_id
`;

export async function listFeed(viewer: string): Promise<FeedItem[]> {
  await reclaimSoon();
  const rows = await sql(
    `${feedSelect}
     where ${liveOnFeed}
     order by coalesce(p.published_at, e.reveal_at) desc, p.created_at desc
     limit 80`,
    [viewer],
  );
  return rows.map(feedItem);
}

export async function listLab(token: string): Promise<LabItem[]> {
  await reclaimSoon();
  const rows = await sql(
    `select
       p.id,
       p.caption,
       (extract(epoch from p.created_at) * 1000) as created_ms,
       (extract(epoch from p.ready_at) * 1000) as ready_ms,
       p.event_id,
       e.name as event_name,
       (extract(epoch from e.reveal_at) * 1000) as reveal_ms,
       case
         when p.event_id is not null then 'sealed'
         when p.developed_at is not null then 'developed'
         when p.ready_at <= now() then 'ready'
         else 'developing'
       end as lab_state
     from photos p
     left join events e on e.id = p.event_id
     where p.shooter_token = $1
       and (
         (p.event_id is null and p.published_at is null)
         or (p.event_id is not null and e.reveal_at > now())
       )
     order by p.created_at desc
     limit 40`,
    [token],
  );
  return rows.map((row) => ({
    id: String(row.id),
    caption: String(row.caption ?? ""),
    createdAt: num(row.created_ms),
    readyAt: num(row.ready_ms),
    labState: String(row.lab_state) as LabState,
    eventId: text(row.event_id),
    eventName: text(row.event_name),
    revealAt: row.reveal_ms == null ? null : num(row.reveal_ms),
  }));
}

export async function createPhoto(input: {
  token: string;
  caption: string;
  imageBase64: unknown;
  eventId: string | null;
  dev: boolean;
  source: string | null;
}): Promise<{ id: string; readyAt: number; createdAt: number; labState: LabState; eventId: string | null }> {
  const image = cleanJpeg(input.imageBase64);
  await assertCreateAllowed("photo", input.source);

  let readyAt = personalReadyAt(Date.now(), input.dev);
  let labState: LabState = "developing";
  if (input.eventId) {
    const events = await sql<{ status: EventStatus; reveal_ms: number }>(
      `select
         case
           when now() < ends_at then 'open'
           when now() < reveal_at then 'sealing'
           else 'ready'
         end as status,
         (extract(epoch from reveal_at) * 1000) as reveal_ms
       from events
       where id = $1`,
      [input.eventId],
    );
    const event = events[0];
    if (!event) throw new HttpError(404, "That event is gone.");
    if (event.status !== "open") throw new HttpError(409, "This event is closed.");
    readyAt = new Date(num(event.reveal_ms));
    labState = "sealed";
  }

  await reclaimNow();
  await makePhotoRoom();
  if ((await countOf("photos")) >= PHOTO_CAP) throw new HttpError(429, "The lab is full.");

  const id = randomUUID();
  const rows = await sql<{ created_ms: number; ready_ms: number }>(
    `insert into photos (id, shooter_token, caption, image_b64, ready_at, event_id)
     values ($1, $2, $3, $4, $5, $6)
     returning
       (extract(epoch from created_at) * 1000) as created_ms,
       (extract(epoch from ready_at) * 1000) as ready_ms`,
    [id, input.token, input.caption, image, readyAt.toISOString(), input.eventId],
  );
  const row = rows[0];
  if (!row) throw new HttpError(500, "The lab hit a snag.");
  await noteCreate("photo", input.source);
  return {
    id,
    readyAt: num(row.ready_ms),
    createdAt: num(row.created_ms),
    labState,
    eventId: input.eventId,
  };
}

export async function developPhoto(id: string, token: string): Promise<{ developedAt: number }> {
  const rows = await sql<{ developed_ms: number }>(
    `update photos
     set developed_at = now()
     where id = $1
       and shooter_token = $2
       and event_id is null
       and developed_at is null
       and published_at is null
       and ready_at <= now()
     returning (extract(epoch from developed_at) * 1000) as developed_ms`,
    [id, token],
  );
  const row = rows[0];
  if (!row) throw new HttpError(409, "That frame can't be developed yet.");
  return { developedAt: num(row.developed_ms) };
}

export async function publishPhoto(id: string, token: string): Promise<{ publishedAt: number }> {
  const rows = await sql<{ published_ms: number }>(
    `update photos
     set published_at = now()
     where id = $1
       and shooter_token = $2
       and event_id is null
       and developed_at is not null
       and published_at is null
     returning (extract(epoch from published_at) * 1000) as published_ms`,
    [id, token],
  );
  const row = rows[0];
  if (!row) throw new HttpError(409, "That frame isn't ready to share.");
  return { publishedAt: num(row.published_ms) };
}

export async function deletePhoto(id: string, token: string): Promise<void> {
  const rows = await sql<{ shooter_token: string }>(
    `select shooter_token from photos where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, "That frame is already gone.");
  if (row.shooter_token !== token) throw new HttpError(403, "Only the person who shot it can delete it.");
  const removed = await sql<{ id: string }>(
    `delete from photos where id = $1 and shooter_token = $2 returning id`,
    [id, token],
  );
  if (!removed[0]) throw new HttpError(404, "That frame is already gone.");
}

export async function filePhoto(id: string, token: string, albumId: string | null): Promise<void> {
  const rows = await sql<{ id: string }>(
    `update photos
     set album_id = $1
     where id = $2
       and shooter_token = $3
       and event_id is null
       and published_at is not null
       and ($1::text is null or exists (select 1 from albums where id = $1))
     returning id`,
    [albumId, id, token],
  );
  if (!rows[0]) throw new HttpError(409, "That frame can't be filed.");
}

export async function readImage(
  id: string,
  viewer: string | null,
): Promise<{ bytes: Buffer; visibility: "public" | "private" } | null> {
  await reclaimSoon();
  const rows = await sql<{
    image_b64: string;
    shooter_token: string;
    developed_at: string | null;
    published_at: string | null;
    event_id: string | null;
    revealed: boolean;
    on_feed: boolean;
  }>(
    `select
       p.image_b64,
       p.shooter_token,
       p.developed_at,
       p.published_at,
       p.event_id,
       coalesce(e.reveal_at <= now(), false) as revealed,
       ${liveOnFeed} as on_feed
     from photos p
     left join events e on e.id = p.event_id
     where p.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const eventPhoto = row.event_id != null;
  if (eventPhoto) {
    if (!flag(row.revealed) || !flag(row.on_feed)) return null;
    return { bytes: Buffer.from(row.image_b64, "base64"), visibility: "public" };
  }
  if (row.published_at != null) {
    if (!flag(row.on_feed)) return null;
    return { bytes: Buffer.from(row.image_b64, "base64"), visibility: "public" };
  }
  if (row.developed_at != null && viewer && viewer === row.shooter_token) {
    return { bytes: Buffer.from(row.image_b64, "base64"), visibility: "private" };
  }
  return null;
}

export async function listAlbums(): Promise<Album[]> {
  await reclaimSoon();
  const rows = await sql(
    `select
       a.id,
       a.name,
       (extract(epoch from a.created_at) * 1000) as created_ms,
       (
         select count(*)::int from photos p
         where p.album_id = a.id and ${livePersonal}
       ) as frame_count
     from albums a
     order by a.created_at desc
     limit 100`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    createdAt: num(row.created_ms),
    frameCount: num(row.frame_count),
  }));
}

export async function createAlbum(name: string, source: string | null): Promise<Album> {
  await assertCreateAllowed("album", source);
  await reclaimNow();
  await makeAlbumRoom();
  if ((await countOf("albums")) >= ALBUM_CAP) throw new HttpError(429, "There are enough rolls already.");
  const id = randomUUID();
  const rows = await sql<{ created_ms: number }>(
    `insert into albums (id, name) values ($1, $2)
     returning (extract(epoch from created_at) * 1000) as created_ms`,
    [id, name],
  );
  await noteCreate("album", source);
  return { id, name, createdAt: num(rows[0]?.created_ms), frameCount: 0 };
}

export async function getAlbum(id: string, viewer: string): Promise<{ album: Album; photos: FeedItem[] } | null> {
  const albums = await sql(
    `select
       a.id,
       a.name,
       (extract(epoch from a.created_at) * 1000) as created_ms,
       (
         select count(*)::int from photos p
         where p.album_id = a.id and ${livePersonal}
       ) as frame_count
     from albums a
     where a.id = $1`,
    [id],
  );
  const album = albums[0];
  if (!album) return null;
  const photos = await sql(
    `${feedSelect}
     where p.album_id = $2 and ${livePersonal}
     order by p.published_at desc, p.created_at desc
     limit 80`,
    [viewer, id],
  );
  return {
    album: {
      id: String(album.id),
      name: String(album.name),
      createdAt: num(album.created_ms),
      frameCount: num(album.frame_count),
    },
    photos: photos.map(feedItem),
  };
}

function eventFrom(row: Record<string, unknown>): EventRoll {
  const status = String(row.status);
  const revealed = status === "ready";
  return {
    id: String(row.id),
    name: String(row.name),
    durationHours: num(row.duration_hours),
    createdAt: num(row.created_ms),
    endsAt: num(row.ends_ms),
    revealAt: num(row.reveal_ms),
    status: (status === "open" || status === "sealing" || status === "ready" ? status : "ready") as EventStatus,
    frameCount: revealed ? num(row.frame_count) : null,
  };
}

const eventSelect = `
  select
    e.id,
    e.name,
    e.duration_hours,
    (extract(epoch from e.created_at) * 1000) as created_ms,
    (extract(epoch from e.ends_at) * 1000) as ends_ms,
    (extract(epoch from e.reveal_at) * 1000) as reveal_ms,
    case
      when now() < e.ends_at then 'open'
      when now() < e.reveal_at then 'sealing'
      else 'ready'
    end as status,
    case
      when now() >= e.reveal_at
        then (select count(*)::int from photos p where p.event_id = e.id)
      else null
    end as frame_count
  from events e
`;

export async function listEvents(): Promise<EventRoll[]> {
  await reclaimSoon();
  const rows = await sql(
    `${eventSelect} where e.reveal_at >= now() - ${feedLifetime} order by e.created_at desc limit 100`,
  );
  return rows.map(eventFrom);
}

export async function createEvent(name: string, hours: number, dev: boolean, source: string | null): Promise<EventRoll> {
  await assertCreateAllowed("event", source);
  await reclaimNow();
  await makeEventRoom();
  if ((await countOf("events")) >= EVENT_CAP) throw new HttpError(429, "There are enough events already.");
  const id = randomUUID();
  const times = eventTimes(Date.now(), hours, dev);
  const rows = await sql(
    `insert into events (id, name, duration_hours, ends_at, reveal_at)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [id, name, hours, times.endsAt.toISOString(), times.revealAt.toISOString()],
  );
  if (!rows[0]) throw new HttpError(500, "The lab hit a snag.");
  await noteCreate("event", source);
  const created = await sql(`${eventSelect} where e.id = $1`, [id]);
  const row = created[0];
  if (!row) throw new HttpError(500, "The lab hit a snag.");
  return eventFrom(row);
}

export async function getEvent(id: string, viewer: string): Promise<EventDetail | null> {
  await reclaimSoon();
  const rows = await sql(
    `${eventSelect} where e.id = $1 and e.reveal_at >= now() - ${feedLifetime}`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const event = eventFrom(row);
  if (event.status !== "ready") return { ...event, photos: [] };
  const photos = await sql(
    `${feedSelect}
     where p.event_id = $2 and ${liveOnFeed}
     order by p.created_at asc
     limit 80`,
    [viewer, id],
  );
  return { ...event, photos: photos.map(feedItem) };
}

export function wantsDevClock(header: string | null): boolean {
  return devClockRequested(header);
}
