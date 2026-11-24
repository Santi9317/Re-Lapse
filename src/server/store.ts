import { randomBytes, randomUUID } from "node:crypto";
import { devClockRequested, eventTimes, FEED_DAYS, personalReadyAt } from "@/lib/clock";
import { sql } from "@/lib/db";
import { isEmoji } from "@/lib/profile";
import type { Album, EventDetail, EventRoll, EventStatus, FeedItem, FrameSticker, LabItem, LabState, ProfileWrite, RollMember, SharedProfile } from "@/lib/types";
import { HttpError } from "@/server/http";
import { assertCreateAllowed, assertJoinAllowed, claimCamera, noteCreate } from "@/server/quota";
import { cleanJpeg } from "@/server/validate";

// A shared frame stays on the feed for a week and is then deleted. Only a
// camera the server issued can create anything, and that camera spends only
// its own window. There is no shared day-one pool. When the table is full,
// this camera can replace its own oldest row and nothing of anyone else's.
// Address headers are not read.
const OWN_PHOTO_CAP = 24;
const OWN_ALBUM_CAP = 8;
const OWN_EVENT_CAP = 4;
const PHOTO_CAP = 500;
const ALBUM_CAP = 200;
const EVENT_CAP = 200;
const PROFILE_CAP = 400;

let lastReclaim = 0;

// FEED_DAYS is a fixed integer. A shared frame stays this long, then the row
// (and the picture stored on it) is removed.
const feedLifetime = `(${FEED_DAYS} * interval '1 day')`;
const livePersonal = `p.event_id is null and p.published_at is not null and p.published_at >= now() - ${feedLifetime}`;
const liveEvent = `p.event_id is not null and e.reveal_at <= now() and e.reveal_at >= now() - ${feedLifetime} and (p.published_at is not null or e.invite_only = false)`;
const liveOnFeed = `(
  (${livePersonal})
  or (${liveEvent})
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
  await sql(
    `delete from photos p
     using cameras c
     where c.token = p.shooter_token
       and c.created_at > now() - interval '24 hours'
       and p.event_id is null
       and p.published_at is null
       and p.created_at < now() - interval '2 hours'`,
  );
  await sql(
    `delete from profiles p
     where p.updated_at < now() - interval '24 hours'
       and not exists (select 1 from photos ph where ph.shooter_token = p.shooter_token)
       and not exists (select 1 from albums a where a.owner_token = p.shooter_token)
       and not exists (select 1 from events e where e.owner_token = p.shooter_token)
       and not exists (select 1 from stickers s where s.shooter_token = p.shooter_token)`,
  );
  await sql(`delete from create_log where created_at < now() - interval '2 hours'`);
  await sql(
    `delete from cameras c
     where c.created_at < now() - interval '6 hours'
       and not exists (select 1 from photos p where p.shooter_token = c.token)
       and not exists (select 1 from albums a where a.owner_token = c.token)
       and not exists (select 1 from events e where e.owner_token = c.token)
       and not exists (select 1 from profiles r where r.shooter_token = c.token)
       and not exists (select 1 from stickers s where s.shooter_token = c.token)`,
  );
}

async function reclaimNow(): Promise<void> {
  lastReclaim = Date.now();
  await runReclaim();
}

async function reclaimSoon(): Promise<void> {
  if (Date.now() - lastReclaim < 60_000) return;
  await reclaimNow();
}

async function countRows(table: "photos" | "albums" | "events"): Promise<number> {
  const query =
    table === "photos"
      ? "select count(*)::int as n from photos"
      : table === "albums"
        ? "select count(*)::int as n from albums"
        : "select count(*)::int as n from events";
  const rows = await sql<{ n: number }>(query);
  return num(rows[0]?.n);
}

async function releaseAbandonedFrames(): Promise<void> {
  await sql(
    `delete from photos
     where event_id is null
       and developed_at is null
       and created_at < now() - interval '35 minutes'`,
  );
}

async function dropOwnPhoto(token: string): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `delete from photos
     where id = (
       select p.id
       from photos p
       where p.shooter_token = $1
         and p.created_at < now() - interval '35 minutes'
       order by p.created_at asc
       limit 1
     )
     returning id`,
    [token],
  );
  return Boolean(rows[0]);
}

async function dropOwnAlbum(token: string): Promise<boolean> {
  const oldest = await sql<{ id: string }>(
    `select id from albums where owner_token = $1 order by created_at asc limit 1`,
    [token],
  );
  const id = oldest[0]?.id;
  if (!id) return false;
  await sql(`update photos set album_id = null where album_id = $1`, [id]);
  const dropped = await sql<{ id: string }>(
    `delete from albums where id = $1 and owner_token = $2 returning id`,
    [id, token],
  );
  return Boolean(dropped[0]);
}

async function dropOwnEvent(token: string): Promise<boolean> {
  const oldest = await sql<{ id: string }>(
    `select e.id
     from events e
     where e.owner_token = $1
       and not exists (
         select 1 from photos p
         where p.event_id = e.id and p.shooter_token <> $1
       )
     order by e.created_at asc
     limit 1`,
    [token],
  );
  const id = oldest[0]?.id;
  if (!id) return false;
  await sql(`delete from photos where event_id = $1 and shooter_token = $2`, [id, token]);
  const dropped = await sql<{ id: string }>(
    `delete from events where id = $1 and owner_token = $2 returning id`,
    [id, token],
  );
  return Boolean(dropped[0]);
}

async function fitOwnSlot(
  token: string,
  table: "photos" | "albums" | "events",
  cap: number,
  dropOwn: (token: string) => Promise<boolean>,
  fullMessage: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await countRows(table)) < cap) return;
    if (!(await dropOwn(token))) break;
  }
  if ((await countRows(table)) >= cap) throw new HttpError(429, fullMessage);
}

async function fitPhotos(token: string): Promise<void> {
  await trimOwnPhotos(token);
  await releaseAbandonedFrames();
  await fitOwnSlot(token, "photos", PHOTO_CAP, dropOwnPhoto, "The lab needs a minute. Try again shortly.");
}

async function fitAlbums(token: string): Promise<void> {
  await trimOwnAlbums(token);
  await fitOwnSlot(token, "albums", ALBUM_CAP, dropOwnAlbum, "There are enough rolls already.");
}

async function fitEvents(token: string): Promise<void> {
  await trimOwnEvents(token);
  await fitOwnSlot(token, "events", EVENT_CAP, dropOwnEvent, "There are enough events already.");
}

async function trimOwnPhotos(token: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rows = await sql<{ n: number }>(
      `select count(*)::int as n from photos where shooter_token = $1`,
      [token],
    );
    if (num(rows[0]?.n) < OWN_PHOTO_CAP) return;
    const dropped = await sql<{ id: string }>(
      `delete from photos
       where id = (
         select id from photos
         where shooter_token = $1
         order by created_at asc
         limit 1
       )
       returning id`,
      [token],
    );
    if (!dropped[0]) return;
  }
}

async function trimOwnAlbums(token: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rows = await sql<{ n: number }>(
      `select count(*)::int as n from albums where owner_token = $1`,
      [token],
    );
    if (num(rows[0]?.n) < OWN_ALBUM_CAP) return;
    const oldest = await sql<{ id: string }>(
      `select id from albums where owner_token = $1 order by created_at asc limit 1`,
      [token],
    );
    const id = oldest[0]?.id;
    if (!id) return;
    await sql(`update photos set album_id = null where album_id = $1`, [id]);
    await sql(`delete from albums where id = $1 and owner_token = $2`, [id, token]);
  }
}

async function trimOwnEvents(token: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rows = await sql<{ n: number }>(
      `select count(*)::int as n from events where owner_token = $1`,
      [token],
    );
    if (num(rows[0]?.n) < OWN_EVENT_CAP) return;
    const oldest = await sql<{ id: string }>(
      `select e.id
       from events e
       where e.owner_token = $1
         and e.reveal_at <= now()
         and not exists (
           select 1 from photos p
           where p.event_id = e.id and p.shooter_token <> $1
         )
       order by e.created_at asc
       limit 1`,
      [token],
    );
    const id = oldest[0]?.id;
    if (!id) {
      throw new HttpError(429, "This camera already has enough events open.");
    }
    await sql(`delete from photos where event_id = $1 and shooter_token = $2`, [id, token]);
    await sql(`delete from events where id = $1 and owner_token = $2`, [id, token]);
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
    profileId: text(row.profile_id),
    profileName: text(row.profile_name),
    profileEmojis: row.profile_id
      ? [String(row.emoji_1 ?? ""), String(row.emoji_2 ?? ""), String(row.emoji_3 ?? "")]
      : null,
    profileAvatar: flag(row.has_avatar),
    stickers: [],
    onFeed: flag(row.on_feed),
  };
}

const feedSelect = `
  select
    p.id,
    p.caption,
    (extract(epoch from p.created_at) * 1000) as created_ms,
    (extract(epoch from p.developed_at) * 1000) as developed_ms,
    (extract(epoch from case when p.event_id is null then p.published_at else e.reveal_at end) * 1000) as sort_ms,
    p.album_id,
    a.name as album_name,
    p.event_id,
    e.name as event_name,
    (p.shooter_token = $1) as mine,
    (
      (p.event_id is null and p.published_at is not null)
      or (
        p.event_id is not null
        and e.reveal_at <= now()
        and (p.published_at is not null or e.invite_only = false)
      )
    ) as on_feed,
    r.id as profile_id,
    r.username as profile_name,
    r.emoji_1,
    r.emoji_2,
    r.emoji_3,
    (r.avatar_image is not null or r.avatar_photo_id is not null) as has_avatar
  from photos p
  left join albums a on a.id = p.album_id
  left join events e on e.id = p.event_id
  left join profiles r on r.shooter_token = p.shooter_token
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
  return attachStickers(rows.map(feedItem), viewer);
}

const STICKER_CAP = 24;

async function attachStickers(items: FeedItem[], viewer: string): Promise<FeedItem[]> {
  if (items.length === 0) return items;
  const ids = items.map((item) => item.id);
  const marks = ids.map((_, index) => `$${index + 2}`).join(", ");
  const rows = await sql(
    `select
       s.photo_id,
       s.emoji,
       pr.id as profile_id,
       pr.username as profile_name,
       (s.shooter_token = $1) as mine
     from stickers s
     join profiles pr on pr.shooter_token = s.shooter_token
     where s.photo_id in (${marks})
     order by s.created_at, s.shooter_token`,
    [viewer, ...ids],
  );
  const grouped = new Map<string, FrameSticker[]>();
  for (const row of rows) {
    const id = String(row.photo_id);
    const list = grouped.get(id) ?? [];
    list.push({
      emoji: String(row.emoji),
      profileId: String(row.profile_id),
      profileName: String(row.profile_name ?? ""),
      mine: flag(row.mine),
    });
    grouped.set(id, list);
  }
  return items.map((item) => ({ ...item, stickers: grouped.get(item.id) ?? [] }));
}

async function stickersFor(photoId: string, viewer: string): Promise<FrameSticker[]> {
  const [item] = await attachStickers(
    [
      {
        id: photoId,
        caption: "",
        createdAt: 0,
        developedAt: null,
        sortAt: 0,
        albumId: null,
        albumName: null,
        eventId: null,
        eventName: null,
        mine: false,
        profileId: null,
        profileName: null,
        profileEmojis: null,
        profileAvatar: false,
        stickers: [],
        onFeed: false,
      },
    ],
    viewer,
  );
  return item?.stickers ?? [];
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
  proof: string | null;
  caption: string;
  imageBase64: unknown;
  eventId: string | null;
  dev: boolean;
}): Promise<{ id: string; readyAt: number; createdAt: number; labState: LabState; eventId: string | null }> {
  const image = cleanJpeg(input.imageBase64);
  await assertCreateAllowed("photo", input.token, input.proof);

  let readyAt = personalReadyAt(Date.now(), input.dev);
  let labState: LabState = "developing";
  if (input.eventId) {
    const events = await sql<{ status: EventStatus; reveal_ms: number; owner_token: string | null; invite_only: boolean; member: boolean }>(
      `select
         case
           when now() < ends_at then 'open'
           when now() < reveal_at then 'sealing'
           else 'ready'
         end as status,
         (extract(epoch from reveal_at) * 1000) as reveal_ms,
         owner_token,
         invite_only,
         (
           invite_only = false
           or owner_token = $2
           or exists (
             select 1 from event_members m
             where m.event_id = events.id and m.shooter_token = $2
           )
         ) as member
       from events
       where id = $1`,
      [input.eventId, input.token],
    );
    const event = events[0];
    if (!event) throw new HttpError(404, "That event is gone.");
    if (event.status !== "open") throw new HttpError(409, "This event is closed.");
    if (flag(event.invite_only) && !flag(event.member)) {
      throw new HttpError(403, "Only people invited to this roll can add a frame.");
    }
    if (event.owner_token === input.token) {
      await sql(
        `insert into event_members (event_id, shooter_token) values ($1, $2)
         on conflict (event_id, shooter_token) do nothing`,
        [input.eventId, input.token],
      );
    }
    readyAt = new Date(num(event.reveal_ms));
    labState = "sealed";
  }

  await reclaimNow();
  await fitPhotos(input.token);
  await claimCamera(input.token, input.proof);

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
  await noteCreate("photo", input.token);
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
  const frames = await sql<{ shooter_token: string; event_id: string | null; published_at: string | null }>(
    `select shooter_token, event_id, published_at from photos where id = $1`,
    [id],
  );
  const frame = frames[0];
  if (!frame) throw new HttpError(404, "That frame is already gone.");
  if (frame.shooter_token !== token) throw new HttpError(403, "Only the person who shot it can file it.");
  if (frame.event_id || frame.published_at == null) throw new HttpError(409, "That frame can't be filed.");
  if (albumId) {
    const albums = await sql<{ owner_token: string | null }>(
      `select owner_token from albums where id = $1`,
      [albumId],
    );
    const album = albums[0];
    if (!album) throw new HttpError(409, "That roll is gone.");
    if (album.owner_token !== token) throw new HttpError(403, "Only the person who started this roll can file into it.");
  }
  const rows = await sql<{ id: string }>(
    `update photos
     set album_id = $1
     where id = $2 and shooter_token = $3
     returning id`,
    [albumId, id, token],
  );
  if (!rows[0]) throw new HttpError(409, "That frame can't be filed.");
}

// One sticker per camera per frame. Picking again replaces that camera's emoji.
export async function setSticker(photoId: string, token: string, emoji: string): Promise<FrameSticker[]> {
  if (!isEmoji(emoji)) throw new HttpError(400, "Pick an emoji.");
  const profile = await readOwnProfile(token);
  if (!profile) throw new HttpError(409, "Name yourself first.");
  const frames = await sql<{ shooter_token: string; on_feed: boolean }>(
    `select p.shooter_token, ${liveOnFeed} as on_feed
     from photos p
     left join events e on e.id = p.event_id
     where p.id = $1`,
    [photoId],
  );
  const frame = frames[0];
  if (!frame) throw new HttpError(404, "That frame is gone.");
  if (frame.shooter_token === token) throw new HttpError(403, "Stick a frame that isn't yours.");
  if (!flag(frame.on_feed)) throw new HttpError(409, "That frame isn't on the feed.");
  const existing = await sql<{ photo_id: string }>(
    `select photo_id from stickers where photo_id = $1 and shooter_token = $2`,
    [photoId, token],
  );
  if (!existing[0]) {
    const counted = await sql<{ n: number }>(
      `select count(*)::int as n from stickers where photo_id = $1`,
      [photoId],
    );
    if (num(counted[0]?.n) >= STICKER_CAP) throw new HttpError(409, "This frame is covered.");
  }
  await sql(
    `insert into stickers (photo_id, shooter_token, emoji)
     values ($1, $2, $3)
     on conflict (photo_id, shooter_token) do update
       set emoji = excluded.emoji, updated_at = now()`,
    [photoId, token, emoji],
  );
  return stickersFor(photoId, token);
}

export async function readImage(
  id: string,
  viewer: string | null,
): Promise<{ bytes: Buffer; visibility: "public" | "private" } | null> {
  await reclaimSoon();
  const who = viewer ?? "00000000-0000-4000-8000-000000000000";
  const rows = await sql<{
    image_b64: string;
    shooter_token: string;
    developed_at: string | null;
    published_at: string | null;
    event_id: string | null;
    revealed: boolean;
    on_feed: boolean;
    member: boolean;
  }>(
    `select
       p.image_b64,
       p.shooter_token,
       p.developed_at,
       p.published_at,
       p.event_id,
       coalesce(e.reveal_at <= now(), false) as revealed,
       ${liveOnFeed} as on_feed,
       (
         e.invite_only = false
         or e.owner_token = $2
         or exists (
           select 1 from event_members m
           where m.event_id = p.event_id and m.shooter_token = $2
         )
       ) as member
     from photos p
     left join events e on e.id = p.event_id
     where p.id = $1`,
    [id, who],
  );
  const row = rows[0];
  if (!row) return null;
  const eventPhoto = row.event_id != null;
  if (eventPhoto) {
    if (flag(row.on_feed)) return { bytes: Buffer.from(row.image_b64, "base64"), visibility: "public" };
    if (flag(row.revealed) && flag(row.member)) {
      return { bytes: Buffer.from(row.image_b64, "base64"), visibility: "private" };
    }
    return null;
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

export async function createAlbum(name: string, token: string, proof: string | null): Promise<Album> {
  await assertCreateAllowed("album", token, proof);
  await reclaimNow();
  await fitAlbums(token);
  await claimCamera(token, proof);
  const id = randomUUID();
  const rows = await sql<{ created_ms: number }>(
    `insert into albums (id, name, owner_token) values ($1, $2, $3)
     returning (extract(epoch from created_at) * 1000) as created_ms`,
    [id, name, token],
  );
  await noteCreate("album", token);
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
    photos: await attachStickers(photos.map(feedItem), viewer),
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
    inviteOnly: flag(row.invite_only),
    owner: flag(row.is_owner),
    memberCount: num(row.member_count),
    inviteCode: text(row.invite_code),
  };
}

// $1 is always the viewer token.
const eventSelect = `
  select
    e.id,
    e.name,
    e.duration_hours,
    e.invite_only,
    (extract(epoch from e.created_at) * 1000) as created_ms,
    (extract(epoch from e.ends_at) * 1000) as ends_ms,
    (extract(epoch from e.reveal_at) * 1000) as reveal_ms,
    (e.owner_token = $1) as is_owner,
    case
      when e.owner_token = $1 then (
        select i.code from event_invites i
        where i.event_id = e.id
        order by i.created_at asc
        limit 1
      )
      else null
    end as invite_code,
    (select count(*)::int from event_members m where m.event_id = e.id) as member_count,
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

const visibleEvent = `(
  e.invite_only = false
  or e.owner_token = $1
  or exists (
    select 1 from event_members m
    where m.event_id = e.id and m.shooter_token = $1
  )
)`;

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeInviteCode(): string {
  const bytes = randomBytes(12);
  let code = "";
  for (const byte of bytes) code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  return code;
}

async function ensureInvite(eventId: string): Promise<string> {
  const existing = await sql<{ code: string }>(`select code from event_invites where event_id = $1`, [eventId]);
  if (existing[0] && existing[0].code.length >= 12) return existing[0].code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeInviteCode();
    try {
      const rows = await sql<{ code: string }>(
        `insert into event_invites (code, event_id) values ($1, $2)
         on conflict (event_id) do update
           set code = excluded.code
           where char_length(event_invites.code) < 12
         returning code`,
        [code, eventId],
      );
      if (rows[0]) return rows[0].code;
    } catch {
      /* the code collided; try another */
    }
    const again = await sql<{ code: string }>(`select code from event_invites where event_id = $1`, [eventId]);
    if (again[0]) return again[0].code;
  }
  throw new HttpError(500, "The lab hit a snag.");
}

async function eventMembers(eventId: string): Promise<RollMember[]> {
  const rows = await sql(
    `select
       r.username as name,
       (m.shooter_token = e.owner_token) as owner
     from event_members m
     join events e on e.id = m.event_id
     left join profiles r on r.shooter_token = m.shooter_token
     where m.event_id = $1
     order by (m.shooter_token = e.owner_token) desc, m.joined_at asc
     limit 24`,
    [eventId],
  );
  return rows.map((row) => ({ name: text(row.name), owner: flag(row.owner) }));
}

export async function listEvents(viewer: string): Promise<EventRoll[]> {
  await reclaimSoon();
  const rows = await sql(
    `${eventSelect}
     where e.reveal_at >= now() - ${feedLifetime}
       and ${visibleEvent}
     order by e.created_at desc
     limit 100`,
    [viewer],
  );
  return rows.map(eventFrom);
}

export async function createEvent(name: string, hours: number, dev: boolean, token: string, proof: string | null): Promise<EventRoll> {
  await assertCreateAllowed("event", token, proof);
  await reclaimNow();
  await fitEvents(token);
  await claimCamera(token, proof);
  const id = randomUUID();
  const times = eventTimes(Date.now(), hours, dev);
  const rows = await sql(
    `insert into events (id, name, duration_hours, ends_at, reveal_at, owner_token, invite_only)
     values ($1, $2, $3, $4, $5, $6, true)
     returning id`,
    [id, name, hours, times.endsAt.toISOString(), times.revealAt.toISOString(), token],
  );
  if (!rows[0]) throw new HttpError(500, "The lab hit a snag.");
  await sql(
    `insert into event_members (event_id, shooter_token) values ($1, $2)
     on conflict (event_id, shooter_token) do nothing`,
    [id, token],
  );
  await ensureInvite(id);
  await noteCreate("event", token);
  const created = await sql(`${eventSelect} where e.id = $2`, [token, id]);
  const row = created[0];
  if (!row) throw new HttpError(500, "The lab hit a snag.");
  return eventFrom(row);
}

async function loadEvent(id: string, viewer: string): Promise<EventRoll | null> {
  const rows = await sql(
    `${eventSelect}
     where e.id = $2
       and e.reveal_at >= now() - ${feedLifetime}
       and ${visibleEvent}`,
    [viewer, id],
  );
  const row = rows[0];
  if (!row) return null;
  const event = eventFrom(row);
  if (event.inviteOnly && event.owner && !event.inviteCode) {
    return { ...event, inviteCode: await ensureInvite(event.id) };
  }
  return event;
}

export async function getEvent(id: string, viewer: string): Promise<EventDetail | null> {
  await reclaimSoon();
  const event = await loadEvent(id, viewer);
  if (!event) return null;
  const members = event.inviteOnly ? await eventMembers(event.id) : [];
  if (event.status !== "ready") return { ...event, photos: [], members };
  const photos = await sql(
    `${feedSelect}
     where p.event_id = $2
     order by p.created_at asc
     limit 80`,
    [viewer, id],
  );
  return { ...event, members, photos: await attachStickers(photos.map(feedItem), viewer) };
}

export async function joinEvent(code: string, token: string, proof: string | null): Promise<EventDetail> {
  await reclaimSoon();
  await assertJoinAllowed(token, proof);
  const invites = await sql<{ event_id: string }>(`select event_id from event_invites where code = $1`, [code]);
  const eventId = invites[0]?.event_id;
  if (!eventId) throw new HttpError(404, "That invite isn't one of ours.");
  await claimCamera(token, proof);
  await sql(
    `insert into event_members (event_id, shooter_token) values ($1, $2)
     on conflict (event_id, shooter_token) do nothing`,
    [eventId, token],
  );
  const event = await getEvent(eventId, token);
  if (!event) throw new HttpError(404, "That roll has lapsed.");
  return event;
}

export async function inviteToEvent(eventId: string, token: string, username: string): Promise<EventDetail> {
  const gate = await sql<{ owner_token: string | null; invite_only: boolean }>(
    `select owner_token, invite_only from events where id = $1`,
    [eventId],
  );
  const event = gate[0];
  if (!event) throw new HttpError(404, "That event is gone.");
  if (!flag(event.invite_only) || event.owner_token !== token) {
    throw new HttpError(403, "Only the person who started the roll can invite.");
  }
  const people = await sql<{ shooter_token: string }>(
    `select shooter_token from profiles where lower(username) = lower($1)`,
    [username],
  );
  if (people.length === 0) throw new HttpError(404, "Nobody goes by that name yet.");
  if (people.length > 1) throw new HttpError(409, "More than one person uses that name. Send the code instead.");
  const guest = people[0]?.shooter_token;
  if (!guest) throw new HttpError(404, "Nobody goes by that name yet.");
  await sql(
    `insert into event_members (event_id, shooter_token) values ($1, $2)
     on conflict (event_id, shooter_token) do nothing`,
    [eventId, guest],
  );
  const detail = await getEvent(eventId, token);
  if (!detail) throw new HttpError(404, "That event is gone.");
  return detail;
}

export async function publishEventFeed(eventId: string, token: string, photoIds: string[]): Promise<EventDetail> {
  const rows = await sql<{ owner_token: string | null; invite_only: boolean; status: string }>(
    `select
       owner_token,
       invite_only,
       case
         when now() < ends_at then 'open'
         when now() < reveal_at then 'sealing'
         else 'ready'
       end as status
     from events
     where id = $1`,
    [eventId],
  );
  const event = rows[0];
  if (!event) throw new HttpError(404, "That event is gone.");
  if (!flag(event.invite_only) || event.owner_token !== token) {
    throw new HttpError(403, "Only the person who started the roll can choose the feed.");
  }
  if (event.status !== "ready") throw new HttpError(409, "The roll isn't back yet.");
  if (photoIds.length > 0) {
    const marks = photoIds.map((_, index) => `$${index + 2}`).join(", ");
    const found = await sql<{ n: number }>(
      `select count(*)::int as n from photos where event_id = $1 and id in (${marks})`,
      [eventId, ...photoIds],
    );
    if (num(found[0]?.n) !== photoIds.length) throw new HttpError(400, "Those frames aren't on this roll.");
  }
  if (photoIds.length === 0) {
    await sql(`update photos set published_at = null where event_id = $1 and published_at is not null`, [eventId]);
  } else {
    const marks = photoIds.map((_, index) => `$${index + 2}`).join(", ");
    await sql(
      `update photos
       set published_at = case
         when id in (${marks}) then coalesce(published_at, now())
         else null
       end
       where event_id = $1`,
      [eventId, ...photoIds],
    );
  }
  const detail = await getEvent(eventId, token);
  if (!detail) throw new HttpError(404, "That event is gone.");
  return detail;
}

export function wantsDevClock(header: string | null): boolean {
  return devClockRequested(header);
}

const publicPhotoSql = `
  select p.id
  from photos p
  left join events e on e.id = p.event_id
  where p.id in (__IDS__)
    and (
      (p.event_id is null and p.published_at is not null)
      or (
        p.event_id is not null
        and e.reveal_at <= now()
        and (p.published_at is not null or e.invite_only = false)
      )
    )
`;

async function publicPhotoIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const marks = ids.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await sql<{ id: string }>(publicPhotoSql.replace("__IDS__", marks), ids);
  const open = new Set(rows.map((row) => String(row.id)));
  return ids.filter((id) => open.has(id));
}

function parseCarousel(value: unknown): string[] {
  if (typeof value !== "string" || value === "") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function sharedProfile(row: Record<string, unknown>, carouselIds: string[]): SharedProfile {
  const id = String(row.id);
  const avatarPhotoId = text(row.avatar_photo_id);
  const hasUpload = row.avatar_image != null && String(row.avatar_image) !== "";
  let avatarUrl: string | null = null;
  if (hasUpload) avatarUrl = `/api/profiles/${id}/avatar`;
  else if (avatarPhotoId) avatarUrl = `/api/photos/${avatarPhotoId}/image`;
  return {
    id,
    username: String(row.username),
    emojis: [String(row.emoji_1), String(row.emoji_2), String(row.emoji_3)],
    avatarPhotoId: hasUpload ? null : avatarPhotoId,
    avatarUrl,
    carouselIds,
  };
}

async function profileRow(where: "id" | "shooter_token", value: string): Promise<Record<string, unknown> | null> {
  const rows = await sql(
    `select id, username, emoji_1, emoji_2, emoji_3, avatar_photo_id, avatar_image, carousel
     from profiles
     where ${where === "id" ? "id" : "shooter_token"} = $1`,
    [value],
  );
  return rows[0] ?? null;
}

export async function readOwnProfile(token: string): Promise<SharedProfile | null> {
  const row = await profileRow("shooter_token", token);
  if (!row) return null;
  return sharedProfile(row, parseCarousel(row.carousel));
}

export async function readPublicProfile(id: string): Promise<SharedProfile | null> {
  const row = await profileRow("id", id);
  if (!row) return null;
  const stored = parseCarousel(row.carousel);
  const carouselIds = await publicPhotoIds(stored);
  const avatarPhotoId = text(row.avatar_photo_id);
  if (avatarPhotoId) {
    const stillPublic = await publicPhotoIds([avatarPhotoId]);
    if (stillPublic.length === 0) row.avatar_photo_id = null;
  }
  return sharedProfile(row, carouselIds);
}

async function fitNewProfile(): Promise<void> {
  const rows = await sql<{ n: number }>(`select count(*)::int as n from profiles`);
  if (num(rows[0]?.n) >= PROFILE_CAP) {
    throw new HttpError(429, "The lab needs a minute. Try again shortly.");
  }
}

export async function saveOwnProfile(token: string, input: ProfileWrite, proof: string | null): Promise<SharedProfile> {
  const existing = await profileRow("shooter_token", token);
  await assertCreateAllowed("profile", token, proof);
  if (!existing) {
    await reclaimNow();
    await fitNewProfile();
  }
  await claimCamera(token, proof);
  const id = existing ? String(existing.id) : randomUUID();
  let avatarPhotoId = input.avatarPhotoId;
  let avatarImage = input.avatarImageBase64;
  if (input.keepUpload && existing) {
    avatarPhotoId = text(existing.avatar_photo_id);
    avatarImage = text(existing.avatar_image);
  }
  if (avatarPhotoId) {
    const open = await publicPhotoIds([avatarPhotoId]);
    if (open.length === 0) throw new HttpError(400, "That frame isn't on the feed.");
    avatarImage = null;
  }
  if (avatarImage) avatarPhotoId = null;
  const carouselIds = await publicPhotoIds(input.carouselIds);
  await sql(
    `insert into profiles (
       id, shooter_token, username, emoji_1, emoji_2, emoji_3, avatar_photo_id, avatar_image, carousel
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (shooter_token) do update set
       username = excluded.username,
       emoji_1 = excluded.emoji_1,
       emoji_2 = excluded.emoji_2,
       emoji_3 = excluded.emoji_3,
       avatar_photo_id = excluded.avatar_photo_id,
       avatar_image = excluded.avatar_image,
       carousel = excluded.carousel,
       updated_at = now()`,
    [
      id,
      token,
      input.username,
      input.emojis[0],
      input.emojis[1],
      input.emojis[2],
      avatarPhotoId,
      avatarImage,
      JSON.stringify(carouselIds),
    ],
  );
  await noteCreate("profile", token);
  const saved = await readOwnProfile(token);
  if (!saved) throw new HttpError(500, "The lab hit a snag.");
  return saved;
}

export async function readAvatar(profileId: string): Promise<Buffer | null> {
  const row = await profileRow("id", profileId);
  if (!row) return null;
  const image = text(row.avatar_image);
  if (image) return Buffer.from(image, "base64");
  const photoId = text(row.avatar_photo_id);
  if (!photoId) return null;
  const open = await publicPhotoIds([photoId]);
  if (open.length === 0) return null;
  const photo = await readImage(photoId, null);
  if (!photo || photo.visibility !== "public") return null;
  return photo.bytes;
}
