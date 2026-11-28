import { randomBytes, randomUUID } from "node:crypto";
import { devClockRequested, eventTimes, FEED_DAYS, personalReadyAt } from "@/lib/clock";
import { sql, withTransaction } from "@/lib/db";
import { noteHand, pickNoteHand } from "@/lib/frame-note";
import { CAROUSEL_LIMIT, isEmoji } from "@/lib/profile";
import { nextStickerSpot, readStickerSpot } from "@/lib/sticker-place";
import type { Album, AlbumDetail, Chemistry, EventDetail, EventRoll, EventStatus, FeedItem, FrameComment, FrameSticker, GalleryCard, LabItem, LabState, ProfilePatch, RollMember, SharedProfile } from "@/lib/types";
import { HttpError } from "@/server/http";
import { assertCreateAllowed, assertJoinAllowed, claimCamera, noteCreate } from "@/server/quota";
import { cleanJpeg, cleanStart } from "@/server/validate";

// A shared frame stays on the feed for a week and is then deleted. Only a
// camera the server issued can create anything, and that camera spends only
// its own rate window. Cameras from the last day share a small pool so one
// visitor cannot fill the tables everyone else uses. When that pool is full,
// this camera can replace its own row and nothing of anyone else's. A camera
// that has been here a day keeps the rest of the table and only replaces its
// own rows. Address headers are not read.
const OWN_PHOTO_CAP = 24;
const OWN_ALBUM_CAP = 8;
const OWN_EVENT_CAP = 4;
const PHOTO_CAP = 500;
const ALBUM_CAP = 200;
const EVENT_CAP = 200;
const YOUNG_PHOTO_CAP = 48;
const YOUNG_ALBUM_CAP = 16;
const YOUNG_EVENT_CAP = 8;
const YOUNG_PROFILE_CAP = 24;
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

async function runReclaim(preserveToken?: string): Promise<void> {
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
  // Unpublished shots on a day-one camera are cleared so a fresh id cannot
  // fill the lab. Shots already tied to a profile stay, and so do the shots
  // of a camera that is saving its profile in this same pass — that save used
  // to reap them before the profile row existed.
  await sql(
    `delete from photos p
     using cameras c
     where c.token = p.shooter_token
       and c.created_at > now() - interval '24 hours'
       and p.event_id is null
       and p.published_at is null
       and p.created_at < now() - interval '2 hours'
       and not exists (select 1 from profiles r where r.shooter_token = p.shooter_token)
       and ($1::text is null or p.shooter_token <> $1::text)`,
    [preserveToken ?? null],
  );
  await sql(
    `delete from profiles p
     where p.updated_at < now() - interval '24 hours'
       and not exists (select 1 from photos ph where ph.shooter_token = p.shooter_token)
       and not exists (select 1 from albums a where a.owner_token = p.shooter_token)
       and not exists (select 1 from events e where e.owner_token = p.shooter_token)
       and not exists (select 1 from stickers s where s.shooter_token = p.shooter_token)
       and not exists (select 1 from frame_notes n where n.shooter_token = p.shooter_token)`,
  );
  await sql(`delete from create_log where created_at < now() - interval '2 hours'`);
  await sql(`delete from camera_mints where created_at < now() - interval '30 days'`);
  await sql(
    `delete from issued_booths b
     where b.created_at < now() - interval '2 hours'
       and not exists (select 1 from camera_mints m where m.booth = b.id)
       and not exists (select 1 from join_requests j where j.booth = b.id)
       and not exists (select 1 from recovery_requests r where r.booth = b.id)`,
  );
  await sql(
    `delete from join_requests
     where status = 'pending'
       and created_at < now() - interval '48 hours'`,
  );
  await sql(
    `delete from join_requests
     where status = 'declined'
       and coalesce(decided_at, created_at) < now() - interval '7 days'`,
  );
  await sql(`delete from gate_guess where created_at < now() - interval '2 hours'`);
  await sql(`delete from gate_client where window_start < now() - interval '2 hours'`);
  await sql(`delete from pin_client where window_start < now() - interval '2 hours'`);
  await sql(
    `delete from recovery_requests
     where status <> 'pending'
       and coalesce(decided_at, created_at) < now() - interval '2 hours'`,
  );
  await sql(
    `delete from recovery_requests
     where status = 'pending'
       and created_at < now() - interval '48 hours'`,
  );
  await sql(
    `delete from cameras c
     where c.created_at < now() - interval '6 hours'
       and not exists (select 1 from photos p where p.shooter_token = c.token)
       and not exists (select 1 from albums a where a.owner_token = c.token)
       and not exists (select 1 from events e where e.owner_token = c.token)
       and not exists (select 1 from profiles r where r.shooter_token = c.token)
       and not exists (select 1 from stickers s where s.shooter_token = c.token)
       and not exists (select 1 from frame_notes n where n.shooter_token = c.token)
       and not exists (select 1 from join_requests j where j.camera_token = c.token)`,
  );
}

async function reclaimNow(preserveToken?: string): Promise<void> {
  lastReclaim = Date.now();
  await runReclaim(preserveToken);
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

function youngFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

async function cameraIsYoung(token: string): Promise<boolean> {
  const rows = await sql<{ young: boolean }>(
    `select created_at > now() - interval '24 hours' as young from cameras where token = $1`,
    [token],
  );
  if (!rows[0]) return true;
  return youngFlag(rows[0].young);
}

async function countCohort(table: "photos" | "albums" | "events", young: boolean): Promise<number> {
  const alias = table === "photos" ? "p" : table === "albums" ? "a" : "e";
  const owner = table === "photos" ? "p.shooter_token" : table === "albums" ? "a.owner_token" : "e.owner_token";
  const age = young
    ? "c.created_at > now() - interval '24 hours'"
    : "(c.token is null or c.created_at <= now() - interval '24 hours')";
  const rows = await sql<{ n: number }>(
    `select count(*)::int as n
     from ${table} ${alias}
     left join cameras c on c.token = ${owner}
     where ${age}`,
  );
  return num(rows[0]?.n);
}

async function fitCohort(
  token: string,
  table: "photos" | "albums" | "events",
  hardCap: number,
  youngCap: number,
  dropOwn: (token: string) => Promise<boolean>,
  fullMessage: string,
): Promise<void> {
  const young = await cameraIsYoung(token);
  const ceiling = young ? youngCap : hardCap - youngCap;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const cohort = await countCohort(table, young);
    const total = await countRows(table);
    if (cohort < ceiling && total < hardCap) return;
    if (!(await dropOwn(token))) break;
  }
  const cohort = await countCohort(table, young);
  const total = await countRows(table);
  if (cohort >= ceiling || total >= hardCap) throw new HttpError(429, fullMessage);
}

async function fitPhotos(token: string): Promise<void> {
  await trimOwnPhotos(token);
  await releaseAbandonedFrames();
  await fitCohort(token, "photos", PHOTO_CAP, YOUNG_PHOTO_CAP, dropOwnPhoto, "The lab needs a minute. Try again shortly.");
}

async function fitAlbums(token: string): Promise<void> {
  await trimOwnAlbums(token);
  await fitCohort(token, "albums", ALBUM_CAP, YOUNG_ALBUM_CAP, dropOwnAlbum, "There are enough galleries already.");
}

async function fitEvents(token: string): Promise<void> {
  await trimOwnEvents(token);
  await fitCohort(token, "events", EVENT_CAP, YOUNG_EVENT_CAP, dropOwnEvent, "There are enough timecapsules already.");
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
      throw new HttpError(429, "This camera already has enough timecapsules open.");
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
    addedAt: num(row.added_ms),
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
    comments: [],
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
    (extract(epoch from case
      when p.event_id is null then p.published_at
      when coalesce(e.invite_only, false) then p.published_at
      else e.reveal_at
    end) * 1000) as added_ms,
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
  return decorateFeed(rows.map(feedItem), viewer);
}

const STICKER_CAP = 24;
const NOTE_CAP = 24;

async function decorateFeed(items: FeedItem[], viewer: string): Promise<FeedItem[]> {
  return attachComments(await attachStickers(items, viewer), viewer);
}

async function attachStickers(items: FeedItem[], viewer: string): Promise<FeedItem[]> {
  if (items.length === 0) return items;
  const ids = items.map((item) => item.id);
  const marks = ids.map((_, index) => `$${index + 2}`).join(", ");
  const rows = await sql(
    `select
       s.id,
       s.photo_id,
       s.emoji,
       s.x,
       s.y,
       pr.id as profile_id,
       pr.username as profile_name,
       (s.shooter_token = $1) as mine,
       (extract(epoch from s.updated_at) * 1000) as pinned_ms
     from stickers s
     join profiles pr on pr.shooter_token = s.shooter_token
     where s.photo_id in (${marks})
     order by s.created_at, s.id`,
    [viewer, ...ids],
  );
  const grouped = new Map<string, FrameSticker[]>();
  for (const row of rows) {
    const id = String(row.photo_id);
    const list = grouped.get(id) ?? [];
    const spot = readStickerSpot(row.x, row.y, list.length);
    list.push({
      id: String(row.id),
      emoji: String(row.emoji),
      profileId: String(row.profile_id),
      profileName: String(row.profile_name ?? ""),
      mine: flag(row.mine),
      pinnedAt: num(row.pinned_ms),
      x: spot.x,
      y: spot.y,
    });
    grouped.set(id, list);
  }
  return items.map((item) => ({ ...item, stickers: grouped.get(item.id) ?? [] }));
}

async function attachComments(items: FeedItem[], viewer: string): Promise<FeedItem[]> {
  if (items.length === 0) return items;
  const ids = items.map((item) => item.id);
  const marks = ids.map((_, index) => `$${index + 2}`).join(", ");
  const rows = await sql(
    `select
       n.id,
       n.photo_id,
       n.body,
       n.hand,
       pr.id as profile_id,
       pr.username as profile_name,
       pr.emoji_1,
       pr.emoji_2,
       pr.emoji_3,
       (n.shooter_token = $1) as mine,
       (extract(epoch from n.created_at) * 1000) as created_ms
     from frame_notes n
     join profiles pr on pr.shooter_token = n.shooter_token
     where n.photo_id in (${marks})
     order by n.created_at, n.id`,
    [viewer, ...ids],
  );
  const grouped = new Map<string, FrameComment[]>();
  for (const row of rows) {
    const id = String(row.photo_id);
    const list = grouped.get(id) ?? [];
    list.push({
      id: String(row.id),
      text: String(row.body),
      profileId: String(row.profile_id),
      profileName: String(row.profile_name ?? ""),
      emojis: [String(row.emoji_1 ?? ""), String(row.emoji_2 ?? ""), String(row.emoji_3 ?? "")],
      hand: noteHand(row.hand),
      mine: flag(row.mine),
      createdAt: num(row.created_ms),
    });
    grouped.set(id, list);
  }
  return items.map((item) => ({ ...item, comments: grouped.get(item.id) ?? [] }));
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
        addedAt: 0,
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
        comments: [],
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
       p.chemistry,
       p.graded,
       p.date_stamp,
       (extract(epoch from p.captured_at) * 1000) as captured_ms,
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
    chemistry: row.chemistry === "default" || row.chemistry === "daylight" || row.chemistry === "night" ? row.chemistry : null,
    graded: flag(row.graded),
    dateStamp: flag(row.date_stamp),
    capturedAt: row.captured_ms == null ? null : num(row.captured_ms),
  }));
}

export async function createPhoto(input: {
  token: string;
  proof: string | null;
  caption: string;
  imageBase64: unknown;
  eventId: string | null;
  dev: boolean;
  dateStamp: boolean;
  capturedAt: number | null;
}): Promise<{ id: string; readyAt: number; createdAt: number; labState: LabState; eventId: string | null }> {
  const image = cleanJpeg(input.imageBase64);
  await assertCreateAllowed("photo", input.token, input.proof);

  let readyAt = personalReadyAt(Date.now(), input.dev);
  let labState: LabState = "developing";
  if (input.eventId) {
    const events = await sql<{ status: EventStatus; reveal_ms: number; owner_token: string | null; invite_only: boolean; member: boolean }>(
      `select
         ${eventPhaseSql()} as status,
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
    if (!event) throw new HttpError(404, "That timecapsule is gone.");
    if (event.status === "waiting") throw new HttpError(409, "This timecapsule isn't open yet.");
    if (event.status !== "open") throw new HttpError(409, "This timecapsule is closed.");
    if (flag(event.invite_only) && !flag(event.member)) {
      throw new HttpError(403, "Only people invited to this timecapsule can add a frame.");
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
  const graded = input.eventId != null;
  const rows = await sql<{ created_ms: number; ready_ms: number }>(
    `insert into photos (
       id, shooter_token, caption, image_b64, ready_at, event_id, date_stamp, captured_at, graded, chemistry
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning
       (extract(epoch from created_at) * 1000) as created_ms,
       (extract(epoch from ready_at) * 1000) as ready_ms`,
    [
      id,
      input.token,
      input.caption,
      image,
      readyAt.toISOString(),
      input.eventId,
      input.dateStamp,
      input.capturedAt == null ? null : new Date(input.capturedAt).toISOString(),
      graded,
      graded ? "default" : null,
    ],
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

export async function chooseChemistry(
  id: string,
  token: string,
  chemistry: Chemistry | null,
): Promise<{ chemistry: Chemistry | null; develop: boolean }> {
  const rows = await sql<{ chemistry: string | null; ready: boolean }>(
    `update photos
     set chemistry = $3
     where id = $1
       and shooter_token = $2
       and event_id is null
       and developed_at is null
       and graded = false
       and published_at is null
     returning chemistry, (ready_at <= now()) as ready`,
    [id, token, chemistry],
  );
  const row = rows[0];
  if (!row) throw new HttpError(409, "That frame can't be developed yet.");
  const saved =
    row.chemistry === "default" || row.chemistry === "daylight" || row.chemistry === "night" ? row.chemistry : null;
  if ((row.chemistry != null && saved == null) || saved !== chemistry) {
    throw new HttpError(409, "That frame can't be developed yet.");
  }
  return { chemistry: saved, develop: flag(row.ready) };
}

export async function readLatent(id: string, token: string): Promise<Buffer | null> {
  const rows = await sql<{ image_b64: string }>(
    `select image_b64
     from photos
     where id = $1
       and shooter_token = $2
       and event_id is null
       and graded = false
       and developed_at is null
       and published_at is null
       and ready_at <= now()`,
    [id, token],
  );
  const row = rows[0];
  if (!row) return null;
  return Buffer.from(row.image_b64, "base64");
}

export async function developPhoto(
  id: string,
  token: string,
  print: { imageBase64: string; chemistry: Chemistry } | null = null,
): Promise<{ developedAt: number }> {
  const existing = await sql<{ graded: boolean; developed_at: string | null; event_id: string | null; ready: boolean }>(
    `select graded, developed_at, event_id, (ready_at <= now()) as ready
     from photos
     where id = $1 and shooter_token = $2`,
    [id, token],
  );
  const row = existing[0];
  if (!row || row.event_id != null || !flag(row.ready)) {
    throw new HttpError(409, "That frame can't be developed yet.");
  }
  if (row.developed_at != null) throw new HttpError(409, "That frame already took its bath.");
  if (!flag(row.graded)) {
    if (!print) throw new HttpError(409, "That frame still needs a bath.");
    const image = cleanJpeg(print.imageBase64);
    const updated = await sql<{ developed_ms: number }>(
      `update photos
       set image_b64 = $3,
           chemistry = $4,
           graded = true,
           developed_at = now()
       where id = $1
         and shooter_token = $2
         and event_id is null
         and developed_at is null
         and graded = false
         and published_at is null
         and ready_at <= now()
       returning (extract(epoch from developed_at) * 1000) as developed_ms`,
      [id, token, image, print.chemistry],
    );
    const done = updated[0];
    if (!done) throw new HttpError(409, "That frame already took its bath.");
    return { developedAt: num(done.developed_ms) };
  }
  const updated = await sql<{ developed_ms: number }>(
    `update photos
     set developed_at = now()
     where id = $1
       and shooter_token = $2
       and event_id is null
       and developed_at is null
       and published_at is null
       and ready_at <= now()
       and graded = true
     returning (extract(epoch from developed_at) * 1000) as developed_ms`,
    [id, token],
  );
  const done = updated[0];
  if (!done) throw new HttpError(409, "That frame can't be developed yet.");
  return { developedAt: num(done.developed_ms) };
}

export async function setCaption(id: string, token: string, caption: string): Promise<{ caption: string }> {
  const frames = await sql<{ shooter_token: string; on_feed: boolean; sent: boolean; preparable: boolean }>(
    `select
       p.shooter_token,
       ${liveOnFeed} as on_feed,
       (p.published_at is not null) as sent,
       (
         (p.event_id is null and p.developed_at is not null and p.published_at is null)
         or (
           p.event_id is not null
           and coalesce(e.invite_only, false)
           and e.reveal_at <= now()
           and p.published_at is null
         )
       ) as preparable
     from photos p
     left join events e on e.id = p.event_id
     where p.id = $1`,
    [id],
  );
  const frame = frames[0];
  if (!frame) throw new HttpError(404, "That frame is gone.");
  if (frame.shooter_token !== token) throw new HttpError(403, "Only the person who shot it can caption it.");
  if (flag(frame.on_feed) || flag(frame.sent)) throw new HttpError(409, "That caption is locked.");
  if (!flag(frame.preparable)) throw new HttpError(409, "That frame isn't ready for a caption.");
  const rows = await sql<{ caption: string }>(
    `update photos set caption = $3 where id = $1 and shooter_token = $2 returning caption`,
    [id, token, caption],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, "That frame is gone.");
  return { caption: row.caption };
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
  const frames = await sql<{ shooter_token: string; event_id: string | null; published_at: string | null; album_id: string | null }>(
    `select shooter_token, event_id, published_at, album_id from photos where id = $1`,
    [id],
  );
  const frame = frames[0];
  if (!frame) throw new HttpError(404, "That frame is already gone.");
  if (frame.shooter_token !== token) throw new HttpError(403, "Only the person who shot it can add it to a gallery.");
  if (frame.event_id || frame.published_at == null) throw new HttpError(409, "That photo can't be added to a gallery.");
  if (albumId) {
    const albums = await sql<{ owner_token: string | null }>(
      `select owner_token from albums where id = $1`,
      [albumId],
    );
    const album = albums[0];
    if (!album) throw new HttpError(409, "That gallery is gone.");
    if (album.owner_token !== token) throw new HttpError(403, "Only the person who made this gallery can change it.");
  }
  const rows = await sql<{ id: string }>(
    `update photos
     set album_id = $1
     where id = $2 and shooter_token = $3
     returning id`,
    [albumId, id, token],
  );
  if (!rows[0]) throw new HttpError(409, "That photo can't be added to a gallery.");
  const previous = text(frame.album_id);
  if (previous && previous !== albumId) {
    await sql(`update albums set cover_photo_id = null where id = $1 and cover_photo_id = $2`, [previous, id]);
  }
}

async function requireFeedFrame(photoId: string): Promise<{ shooter_token: string }> {
  const frames = await sql<{ shooter_token: string; on_feed: boolean }>(
    `select p.shooter_token, ${liveOnFeed} as on_feed
     from photos p
     left join events e on e.id = p.event_id
     where p.id = $1`,
    [photoId],
  );
  const frame = frames[0];
  if (!frame) throw new HttpError(404, "That frame is gone.");
  if (!flag(frame.on_feed)) throw new HttpError(409, "That frame isn't on the feed.");
  return frame;
}

// Each tap adds another sticker. A later tap does not replace the ones already there.
export async function setSticker(photoId: string, token: string, emoji: string): Promise<FrameSticker[]> {
  if (!isEmoji(emoji)) throw new HttpError(400, "Pick an emoji.");
  const profile = await readOwnProfile(token);
  if (!profile) throw new HttpError(409, "Name yourself first.");
  const frame = await requireFeedFrame(photoId);
  if (frame.shooter_token === token) throw new HttpError(403, "Stick a frame that isn't yours.");
  const placed = await sql<{ x: number | null; y: number | null }>(
    `select x, y from stickers where photo_id = $1 order by created_at, id`,
    [photoId],
  );
  if (placed.length >= STICKER_CAP) throw new HttpError(409, "This frame is covered.");
  const spot = nextStickerSpot(placed.map((row, index) => readStickerSpot(row.x, row.y, index)));
  await sql(
    `insert into stickers (id, photo_id, shooter_token, emoji, x, y)
     values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), photoId, token, emoji, spot.x, spot.y],
  );
  return stickersFor(photoId, token);
}

/** The person who stuck it can take that one emoji back. The others stay. */
export async function removeSticker(photoId: string, token: string, stickerId: string): Promise<FrameSticker[]> {
  await requireFeedFrame(photoId);
  const removed = await sql<{ id: string }>(
    `delete from stickers
     where id = $1 and photo_id = $2 and shooter_token = $3
     returning id`,
    [stickerId, photoId, token],
  );
  if (!removed[0]) throw new HttpError(404, "That sticker is gone.");
  return stickersFor(photoId, token);
}

/** Slide one sticker aside. The pin time stays, so the move does not read as a new pin. */
export async function moveSticker(
  photoId: string,
  token: string,
  stickerId: string,
  x: number,
  y: number,
): Promise<FrameSticker[]> {
  await requireFeedFrame(photoId);
  if (!(await readOwnProfile(token))) throw new HttpError(409, "Name yourself first.");
  const moved = await sql<{ id: string }>(
    `update stickers
     set x = $3, y = $4
     where id = $1 and photo_id = $2
     returning id`,
    [stickerId, photoId, x, y],
  );
  if (!moved[0]) throw new HttpError(404, "That sticker is gone.");
  return stickersFor(photoId, token);
}

async function commentsFor(photoId: string, viewer: string): Promise<FrameComment[]> {
  const [item] = await attachComments(
    [
      {
        id: photoId,
        caption: "",
        createdAt: 0,
        developedAt: null,
        sortAt: 0,
        addedAt: 0,
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
        comments: [],
        onFeed: false,
      },
    ],
    viewer,
  );
  return item?.comments ?? [];
}

/** Signing adds a line. Another sign adds another line, until the back is full. */
export async function setFrameNote(photoId: string, token: string, text: string): Promise<FrameComment[]> {
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
  // The person who shot it can sign their own photo. Anyone can still sign a frame on the feed.
  if (!flag(frame.on_feed)) throw new HttpError(409, "That frame isn't on the feed.");
  const counted = await sql<{ n: number }>(
    `select count(*)::int as n from frame_notes where photo_id = $1`,
    [photoId],
  );
  if (num(counted[0]?.n) >= NOTE_CAP) throw new HttpError(409, "The back of this frame is full.");
  await sql(
    `insert into frame_notes (id, photo_id, shooter_token, body, hand)
     values ($1, $2, $3, $4, $5)`,
    [randomUUID(), photoId, token, text, pickNoteHand()],
  );
  return commentsFor(photoId, token);
}

/** The writer can take their own line back while the frame is on the feed. Anyone else's line stays. */
export async function removeFrameNote(photoId: string, token: string, noteId: string): Promise<FrameComment[]> {
  const frames = await sql<{ on_feed: boolean }>(
    `select ${liveOnFeed} as on_feed
     from photos p
     left join events e on e.id = p.event_id
     where p.id = $1`,
    [photoId],
  );
  const frame = frames[0];
  if (!frame) throw new HttpError(404, "That frame is gone.");
  if (!flag(frame.on_feed)) throw new HttpError(409, "That frame isn't on the feed.");
  const removed = await sql<{ id: string }>(
    `delete from frame_notes
     where id = $1 and photo_id = $2 and shooter_token = $3
     returning id`,
    [noteId, photoId, token],
  );
  if (!removed[0]) throw new HttpError(404, "That note is gone.");
  return commentsFor(photoId, token);
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

const galleryColumns = `
  a.id,
  a.name,
  a.owner_token,
  (extract(epoch from a.created_at) * 1000) as created_ms,
  (
    select count(*)::int from photos p
    where p.album_id = a.id
      and p.shooter_token = a.owner_token
      and ${livePersonal}
  ) as frame_count,
  coalesce(
    (
      select p.id from photos p
      where p.id = a.cover_photo_id
        and p.album_id = a.id
        and p.shooter_token = a.owner_token
        and ${livePersonal}
    ),
    (
      select p.id from photos p
      where p.album_id = a.id
        and p.shooter_token = a.owner_token
        and ${livePersonal}
      order by p.published_at asc, p.created_at asc
      limit 1
    )
  ) as cover_photo_id
`;

function albumFrom(row: Record<string, unknown>, viewer: string): Album {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: num(row.created_ms),
    frameCount: num(row.frame_count),
    coverPhotoId: text(row.cover_photo_id),
    owner: text(row.owner_token) === viewer,
  };
}

function galleryCard(row: Record<string, unknown>): GalleryCard {
  return {
    id: String(row.id),
    name: String(row.name),
    frameCount: num(row.frame_count),
    coverPhotoId: text(row.cover_photo_id),
  };
}

export async function listAlbums(viewer: string): Promise<Album[]> {
  await reclaimSoon();
  const rows = await sql(
    `select ${galleryColumns}
     from albums a
     where a.owner_token = $1
     order by a.created_at desc
     limit 100`,
    [viewer],
  );
  return rows.map((row) => albumFrom(row, viewer));
}

async function galleriesForToken(token: string): Promise<GalleryCard[]> {
  const rows = await sql(
    `select ${galleryColumns}
     from albums a
     where a.owner_token = $1
     order by a.created_at desc
     limit 40`,
    [token],
  );
  return rows.map(galleryCard);
}

async function galleriesForProfile(profileId: string): Promise<GalleryCard[]> {
  const rows = await sql(
    `select ${galleryColumns}
     from albums a
     join profiles r on r.shooter_token = a.owner_token
     where r.id = $1
     order by a.created_at desc
     limit 40`,
    [profileId],
  );
  return rows.map(galleryCard);
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
  return { id, name, createdAt: num(rows[0]?.created_ms), frameCount: 0, coverPhotoId: null, owner: true };
}

export async function getAlbum(id: string, viewer: string): Promise<AlbumDetail | null> {
  const albums = await sql(
    `select ${galleryColumns}
     from albums a
     where a.id = $1`,
    [id],
  );
  const row = albums[0];
  if (!row) return null;
  const album = albumFrom(row, viewer);
  const photos = await sql(
    `${feedSelect}
     where p.album_id = $2
       and p.shooter_token = $3
       and ${livePersonal}
     order by p.published_at asc, p.created_at asc
     limit 80`,
    [viewer, id, text(row.owner_token) ?? ""],
  );
  const library = album.owner
    ? await sql(
        `${feedSelect}
         where p.shooter_token = $1
           and p.event_id is null
           and ${livePersonal}
         order by p.published_at desc, p.created_at desc
         limit 80`,
        [viewer],
      )
    : [];
  return {
    album,
    photos: await decorateFeed(photos.map(feedItem), viewer),
    library: await decorateFeed(library.map(feedItem), viewer),
  };
}

async function ownAlbum(id: string, token: string): Promise<void> {
  const rows = await sql<{ owner_token: string | null }>(`select owner_token from albums where id = $1`, [id]);
  const album = rows[0];
  if (!album) throw new HttpError(404, "That gallery is gone.");
  if (album.owner_token !== token) throw new HttpError(403, "Only the person who made this gallery can change it.");
}

export async function updateAlbum(
  id: string,
  token: string,
  patch: { name?: string; coverPhotoId?: string | null },
): Promise<Album> {
  await ownAlbum(id, token);
  if (patch.name) await sql(`update albums set name = $1 where id = $2 and owner_token = $3`, [patch.name, id, token]);
  if (patch.coverPhotoId !== undefined) {
    if (patch.coverPhotoId === null) {
      await sql(`update albums set cover_photo_id = null where id = $1 and owner_token = $2`, [id, token]);
    } else {
      const covers = await sql<{ id: string }>(
        `select p.id
         from photos p
         where p.id = $1
           and p.album_id = $2
           and p.shooter_token = $3
           and ${livePersonal}`,
        [patch.coverPhotoId, id, token],
      );
      if (!covers[0]) throw new HttpError(400, "Pick a cover from this gallery.");
      await sql(`update albums set cover_photo_id = $1 where id = $2 and owner_token = $3`, [patch.coverPhotoId, id, token]);
    }
  }
  const found = await getAlbum(id, token);
  if (!found) throw new HttpError(404, "That gallery is gone.");
  return found.album;
}

export async function deleteAlbum(id: string, token: string): Promise<void> {
  await ownAlbum(id, token);
  await withTransaction(async (q) => {
    // A photo lives on the camera roll. Gallery membership is album_id.
    // Only a row with no image of its own would leave with the gallery, and the
    // photo check does not allow that row.
    await q(
      `delete from photos
       where album_id = $1
         and shooter_token = $2
         and event_id is null
         and published_at is null
         and developed_at is null
         and char_length(coalesce(image_b64, '')) < 100`,
      [id, token],
    );
    await q(`update photos set album_id = null where album_id = $1`, [id]);
    const dropped = await q<{ id: string }>(
      `delete from albums where id = $1 and owner_token = $2 returning id`,
      [id, token],
    );
    if (!dropped[0]) throw new HttpError(404, "That gallery is gone.");
  });
}

function eventPhaseSql(table = ""): string {
  const column = table ? `${table}.` : "";
  return `case
    when now() < ${column}starts_at then 'waiting'
    when now() < ${column}ends_at then 'open'
    when now() < ${column}reveal_at then 'sealing'
    else 'ready'
  end`;
}

function eventStatus(value: string): EventStatus {
  if (value === "waiting" || value === "open" || value === "sealing" || value === "ready") return value;
  return "ready";
}

function eventFrom(row: Record<string, unknown>): EventRoll {
  const status = eventStatus(String(row.status));
  const revealed = status === "ready";
  return {
    id: String(row.id),
    name: String(row.name),
    durationHours: num(row.duration_hours),
    createdAt: num(row.created_ms),
    startsAt: num(row.starts_ms),
    endsAt: num(row.ends_ms),
    revealAt: num(row.reveal_ms),
    status,
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
    (extract(epoch from e.starts_at) * 1000) as starts_ms,
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
    ${eventPhaseSql("e")} as status,
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

export async function createEvent(
  name: string,
  hours: number,
  dev: boolean,
  token: string,
  proof: string | null,
  startMs: unknown,
): Promise<EventRoll> {
  const startsAt = cleanStart(startMs);
  await assertCreateAllowed("event", token, proof);
  await reclaimNow();
  await fitEvents(token);
  await claimCamera(token, proof);
  const id = randomUUID();
  const times = eventTimes(Date.now(), hours, dev, startsAt);
  const rows = await sql(
    `insert into events (id, name, duration_hours, starts_at, ends_at, reveal_at, owner_token, invite_only)
     values ($1, $2, $3, $4, $5, $6, $7, true)
     returning id`,
    [id, name, hours, times.startsAt.toISOString(), times.endsAt.toISOString(), times.revealAt.toISOString(), token],
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
  return { ...event, members, photos: await decorateFeed(photos.map(feedItem), viewer) };
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
  if (!event) throw new HttpError(404, "That timecapsule has lapsed.");
  return event;
}

export async function inviteToEvent(eventId: string, token: string, username: string): Promise<EventDetail> {
  const gate = await sql<{ owner_token: string | null; invite_only: boolean }>(
    `select owner_token, invite_only from events where id = $1`,
    [eventId],
  );
  const event = gate[0];
  if (!event) throw new HttpError(404, "That timecapsule is gone.");
  if (!flag(event.invite_only) || event.owner_token !== token) {
    throw new HttpError(403, "Only the person who started the timecapsule can invite.");
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
  if (!detail) throw new HttpError(404, "That timecapsule is gone.");
  return detail;
}

export async function publishEventFeed(eventId: string, token: string, photoIds: string[]): Promise<EventDetail> {
  const rows = await sql<{ owner_token: string | null; invite_only: boolean; status: string }>(
    `select
       owner_token,
       invite_only,
       ${eventPhaseSql()} as status
     from events
     where id = $1`,
    [eventId],
  );
  const event = rows[0];
  if (!event) throw new HttpError(404, "That timecapsule is gone.");
  if (!flag(event.invite_only) || event.owner_token !== token) {
    throw new HttpError(403, "Only the person who started the timecapsule can choose the feed.");
  }
  if (event.status !== "ready") throw new HttpError(409, "The timecapsule isn't back yet.");
  if (photoIds.length > 0) {
    const marks = photoIds.map((_, index) => `$${index + 2}`).join(", ");
    const found = await sql<{ n: number }>(
      `select count(*)::int as n from photos where event_id = $1 and id in (${marks})`,
      [eventId, ...photoIds],
    );
    if (num(found[0]?.n) !== photoIds.length) throw new HttpError(400, "Those frames aren't on this timecapsule.");
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
  if (!detail) throw new HttpError(404, "That timecapsule is gone.");
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

/** Frames on the feed that this profile took. Other people's shots are left out. */
async function ownPublicPhotoIds(ids: string[], owner: string): Promise<string[]> {
  const open = await publicPhotoIds(ids);
  if (open.length === 0) return [];
  const marks = open.map((_, index) => `$${index + 2}`).join(", ");
  const rows = await sql<{ id: string }>(
    `select id from photos where shooter_token = $1 and id in (${marks})`,
    [owner, ...open],
  );
  const shot = new Set(rows.map((row) => String(row.id)));
  return open.filter((id) => shot.has(id));
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

function sharedProfile(row: Record<string, unknown>, carouselIds: string[], galleries: GalleryCard[]): SharedProfile {
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
    galleries,
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
  return sharedProfile(row, parseCarousel(row.carousel), await galleriesForToken(token));
}

export type ActiveProfile = {
  id: string;
  username: string;
  emojis: [string, string, string];
  updatedAt: number;
};

/** Profiles still in the app. Reclaim has already dropped the ones that lapsed. */
export async function listActiveProfiles(): Promise<ActiveProfile[]> {
  await reclaimSoon();
  const rows = await sql<{
    id: string;
    username: string;
    emoji_1: string;
    emoji_2: string;
    emoji_3: string;
    updated_ms: number | string;
  }>(
    `select id, username, emoji_1, emoji_2, emoji_3,
            (extract(epoch from updated_at) * 1000) as updated_ms
     from profiles
     order by lower(username) asc, id asc`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    username: String(row.username),
    emojis: [String(row.emoji_1), String(row.emoji_2), String(row.emoji_3)],
    updatedAt: Math.round(Number(row.updated_ms)),
  }));
}

export async function profileWasRemoved(token: string): Promise<boolean> {
  const rows = await sql<{ shooter_token: string }>(
    `select shooter_token from profile_removals where shooter_token = $1`,
    [token],
  );
  return Boolean(rows[0]);
}

/** Deletes the profile row. Frames stay. The name leaves the feed and the lab. */
export async function removeProfile(id: string): Promise<boolean> {
  return withTransaction(async (q) => {
    const rows = await q<{ shooter_token: string }>(
      `delete from profiles where id = $1 returning shooter_token`,
      [id],
    );
    const token = rows[0]?.shooter_token ? String(rows[0].shooter_token) : "";
    if (!token) return false;
    await q(
      `insert into profile_removals (shooter_token, removed_at)
       values ($1, now())
       on conflict (shooter_token) do update set removed_at = now()`,
      [token],
    );
    return true;
  });
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
  return sharedProfile(row, carouselIds, await galleriesForProfile(id));
}

async function fitNewProfile(token: string): Promise<void> {
  const young = await cameraIsYoung(token);
  const cohortRows = await sql<{ n: number }>(
    `select count(*)::int as n
     from profiles p
     left join cameras c on c.token = p.shooter_token
     where ${young ? "c.created_at > now() - interval '24 hours'" : "(c.token is null or c.created_at <= now() - interval '24 hours')"}`,
  );
  const totalRows = await sql<{ n: number }>(`select count(*)::int as n from profiles`);
  const ceiling = young ? YOUNG_PROFILE_CAP : PROFILE_CAP - YOUNG_PROFILE_CAP;
  if (num(cohortRows[0]?.n) >= ceiling || num(totalRows[0]?.n) >= PROFILE_CAP) {
    throw new HttpError(429, "The lab needs a minute. Try again shortly.");
  }
}

/** Shots this camera already kept, newest first, for the profile strip. */
async function ownKeptPhotoIds(token: string): Promise<string[]> {
  const rows = await sql<{ id: string }>(
    `select p.id
     from photos p
     where p.shooter_token = $1
       and p.event_id is null
       and (p.developed_at is not null or p.published_at is not null)
     order by p.created_at desc
     limit $2`,
    [token, CAROUSEL_LIMIT],
  );
  return rows.map((row) => String(row.id));
}

async function portraitColumns(
  patch: ProfilePatch,
): Promise<{ photoId: string | null; image: string | null } | undefined> {
  if (patch.avatarPhotoId === undefined && patch.avatarImageBase64 === undefined) return undefined;
  let photoId = patch.avatarPhotoId ?? null;
  let image = patch.avatarImageBase64 ?? null;
  if (photoId) {
    const open = await publicPhotoIds([photoId]);
    if (open.length === 0) throw new HttpError(400, "That frame isn't on the feed.");
    image = null;
  }
  if (image) photoId = null;
  return { photoId, image };
}

export async function saveOwnProfile(
  token: string,
  input: ProfilePatch,
  proof: string | null,
  replaceRemoved = false,
): Promise<SharedProfile> {
  const removed = await profileWasRemoved(token);
  if (removed && !replaceRemoved) throw new HttpError(409, "That profile is gone.");
  const existing = await profileRow("shooter_token", token);
  // keepUpload means the stored portrait stays. A null portrait in the same
  // body is how an older full write says "I am not replacing the picture."
  const portrait = input.keepUpload ? undefined : await portraitColumns(input);
  const writing =
    input.username !== undefined ||
    input.emojis !== undefined ||
    input.carouselIds !== undefined ||
    portrait !== undefined;
  if (!existing && (input.username === undefined || input.emojis === undefined)) {
    throw new HttpError(400, input.username === undefined ? "Give yourself a short name." : "Pick three emojis.");
  }
  if (existing && !writing) {
    const current = await readOwnProfile(token);
    if (!current) throw new HttpError(500, "The lab hit a snag.");
    return current;
  }
  await assertCreateAllowed("profile", token, proof);
  if (!existing) {
    // Reap other visitors first, but not the shots this camera already took.
    // Those rows are attached by the profile insert below.
    await reclaimNow(token);
    await fitNewProfile(token);
  }
  await claimCamera(token, proof);
  if (!existing) {
    const username = input.username;
    const emojis = input.emojis;
    if (!username || !emojis) throw new HttpError(400, "Give yourself a short name.");
    const carouselIds = await ownKeptPhotoIds(token);
    const seen = new Set(carouselIds);
    if (input.carouselIds && input.carouselIds.length > 0) {
      for (const id of await ownPublicPhotoIds(input.carouselIds, token)) {
        if (carouselIds.length >= CAROUSEL_LIMIT) break;
        if (seen.has(id)) continue;
        seen.add(id);
        carouselIds.push(id);
      }
    }
    await sql(
      `insert into profiles (
         id, shooter_token, username, emoji_1, emoji_2, emoji_3, avatar_photo_id, avatar_image, carousel, pin_hash
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, (select pin_hash from cameras where token = $2)
       )
       on conflict (shooter_token) do update set
         username = excluded.username,
         emoji_1 = excluded.emoji_1,
         emoji_2 = excluded.emoji_2,
         emoji_3 = excluded.emoji_3,
         avatar_photo_id = excluded.avatar_photo_id,
         avatar_image = excluded.avatar_image,
         carousel = excluded.carousel,
         pin_hash = coalesce(profiles.pin_hash, excluded.pin_hash),
         updated_at = now()`,
      [
        randomUUID(),
        token,
        username,
        emojis[0],
        emojis[1],
        emojis[2],
        portrait?.photoId ?? null,
        portrait?.image ?? null,
        JSON.stringify(carouselIds),
      ],
    );
  } else {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (input.username !== undefined) add("username", input.username);
    if (input.emojis) {
      add("emoji_1", input.emojis[0]);
      add("emoji_2", input.emojis[1]);
      add("emoji_3", input.emojis[2]);
    }
    if (portrait !== undefined) {
      add("avatar_photo_id", portrait.photoId);
      add("avatar_image", portrait.image);
    }
    if (input.carouselIds) {
      // The arranged strip wins: this camera's published frames, in that order.
      // Shots that are not on the feed stay in the lab; they are not deleted.
      add("carousel", JSON.stringify(await ownPublicPhotoIds(input.carouselIds, token)));
    }
    if (sets.length > 0) {
      sets.push("updated_at = now()");
      params.push(token);
      await sql(`update profiles set ${sets.join(", ")} where shooter_token = $${params.length}`, params);
    }
  }
  if (removed) await sql(`delete from profile_removals where shooter_token = $1`, [token]);
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
