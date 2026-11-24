import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { MINT_LIMITS } from "@/server/mint";
import { isUuid, readProof } from "@/server/validate";

/**
 * Each camera has its own photo, roll, event, profile, and invite window.
 * One camera cannot spend another's. A brand-new id is written to
 * camera_mints before any proof is returned. New ids are counted for the
 * browser booth that asked, and a higher ceiling covers every booth so
 * dropping the cookie cannot mint without a bound. Sending an id without
 * its proof does not reveal that proof and does not authorize the camera.
 * Asking again with the proof does not spend a new-id window. Address
 * headers are not read.
 */
const QUOTA = {
  photo: { windowMs: 10 * 60_000, limit: 12 },
  album: { windowMs: 60 * 60_000, limit: 4 },
  event: { windowMs: 60 * 60_000, limit: 2 },
  profile: { windowMs: 60 * 60_000, limit: 4 },
  join: { windowMs: 60 * 60_000, limit: 8 },
} as const;

const MINT_WINDOW_MS = 10 * 60_000;

export type CreateKind = Exclude<keyof typeof QUOTA, "join">;

const PROOF = /^[0-9a-f]{64}$/;

function asCount(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function signingSecret(): Promise<Buffer> {
  const rows = await sql<{ secret: string }>(`select secret from camera_secret where id = 1`);
  const found = rows[0]?.secret;
  if (found && found.length === 64) return Buffer.from(found, "hex");
  const secret = randomBytes(32).toString("hex");
  await sql(
    `insert into camera_secret (id, secret) values (1, $1) on conflict (id) do nothing`,
    [secret],
  );
  const again = await sql<{ secret: string }>(`select secret from camera_secret where id = 1`);
  const stored = again[0]?.secret;
  if (!stored) throw new HttpError(500, "The lab hit a snag.");
  return Buffer.from(stored, "hex");
}

function sign(token: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function cameraProof(token: string): Promise<string> {
  return sign(token, await signingSecret());
}

async function proofMatches(token: string, proof: string | null): Promise<boolean> {
  if (!proof || !PROOF.test(proof)) return false;
  const expected = Buffer.from(sign(token, await signingSecret()));
  const given = Buffer.from(proof);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

async function countForCamera(kind: keyof typeof QUOTA, windowMs: number, token: string): Promise<number> {
  const rows = await sql<{ n: number }>(
    `select count(*)::int as n
     from create_log
     where kind = $1
       and camera_key = $2
       and created_at > now() - ($3::int * interval '1 millisecond')`,
    [kind, token, windowMs],
  );
  return asCount(rows[0]?.n);
}

async function cameraExists(token: string): Promise<boolean> {
  const rows = await sql<{ young: boolean }>(
    `select created_at > now() - interval '24 hours' as young from cameras where token = $1`,
    [token],
  );
  return Boolean(rows[0]);
}

async function mintRecorded(token: string): Promise<boolean> {
  const rows = await sql<{ token: string }>(`select token from camera_mints where token = $1`, [token]);
  return Boolean(rows[0]);
}

async function cameraIsIssued(token: string, proof: string | null): Promise<boolean> {
  if (!(await proofMatches(token, proof))) return false;
  if (await mintRecorded(token)) return true;
  return cameraExists(token);
}

export async function issueCamera(
  presented: string | null,
  proof: string | null,
  booth: string,
): Promise<{ token: string; proof: string }> {
  if (presented && isUuid(presented) && proof) {
    const token = presented.toLowerCase();
    if (await cameraIsIssued(token, proof)) return { token, proof };
  }
  if (!isUuid(booth)) throw new HttpError(400, "The lab didn't answer.");
  const token = randomUUID();
  const minted = await sql<{ token: string }>(
    `insert into camera_mints (token, created_at, booth)
     select $1::text, now(), $2::text
     where (
       select count(*)::int
       from camera_mints
       where booth = $2::text
         and created_at > now() - ($3::int * interval '1 millisecond')
     ) < $4::int
     and (
       select count(*)::int
       from camera_mints
       where created_at > now() - ($3::int * interval '1 millisecond')
     ) < $5::int
     returning token`,
    [token, booth.toLowerCase(), MINT_WINDOW_MS, MINT_LIMITS.perBooth, MINT_LIMITS.global],
  );
  const issued = minted[0]?.token;
  if (!issued) throw new HttpError(429, "New cameras need a minute. Try again shortly.");
  return { token: String(issued), proof: await cameraProof(String(issued)) };
}

export async function cameraHoldsProof(token: string, proof: string | null): Promise<boolean> {
  if (!isUuid(token) || !proof) return false;
  return proofMatches(token.toLowerCase(), proof.toLowerCase());
}

export async function viewerFromCookie(token: string | null, proof: string | null): Promise<string | null> {
  if (!token || !isUuid(token)) return null;
  const id = token.toLowerCase();
  if (!(await cameraIsIssued(id, proof))) return null;
  return id;
}

function readAuthCookie(request: Request): { token: string; proof: string } | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith("relapse_auth=")) continue;
    let value = "";
    try {
      value = decodeURIComponent(trimmed.slice("relapse_auth=".length));
    } catch {
      return null;
    }
    const dot = value.indexOf(".");
    if (dot < 0) continue;
    const token = value.slice(0, dot);
    if (!isUuid(token)) continue;
    return { token: token.toLowerCase(), proof: value.slice(dot + 1) };
  }
  return null;
}

/** The camera a request can prove, from its header or its httpOnly cookie. */
export async function provenCamera(request: Request): Promise<string | null> {
  const header = request.headers.get("x-shooter-token");
  const headerToken = header && isUuid(header) ? header.toLowerCase() : null;
  if (headerToken && (await cameraHoldsProof(headerToken, readProof(request)))) return headerToken;
  const cookie = readAuthCookie(request);
  if (!cookie || !(await cameraHoldsProof(cookie.token, cookie.proof))) return null;
  return cookie.token;
}

const ANON = "00000000-0000-4000-8000-000000000000";

export async function optionalActor(request: Request): Promise<string> {
  return (await provenCamera(request)) ?? ANON;
}

export async function requireActor(request: Request): Promise<string> {
  const actor = await provenCamera(request);
  if (!actor) throw new HttpError(403, "This camera hasn't been issued.");
  return actor;
}

export async function assertCreateAllowed(
  kind: CreateKind,
  token: string,
  proof: string | null,
): Promise<void> {
  if (!(await cameraIsIssued(token, proof))) {
    throw new HttpError(403, "This camera hasn't been issued.");
  }
  const rule = QUOTA[kind];
  const own = (await cameraExists(token)) ? await countForCamera(kind, rule.windowMs, token) : 0;
  if (own >= rule.limit) {
    throw new HttpError(429, "This camera needs a minute. Try again shortly.");
  }
}

export async function assertJoinAllowed(token: string, proof: string | null): Promise<void> {
  if (!(await cameraIsIssued(token, proof))) {
    throw new HttpError(403, "This camera hasn't been issued.");
  }
  const rule = QUOTA.join;
  const own = await countForCamera("join", rule.windowMs, token);
  if (own >= rule.limit) {
    throw new HttpError(429, "This camera needs a minute. Try again shortly.");
  }
  await sql(
    `insert into create_log (id, kind, camera_key) values ($1, 'join', $2)`,
    [randomUUID(), token],
  );
}

/** Writes the camera row once this camera is about to keep something. */
export async function claimCamera(token: string, proof: string | null): Promise<void> {
  if (await cameraExists(token)) return;
  if (!(await proofMatches(token, proof))) throw new HttpError(403, "This camera hasn't been issued.");
  await sql(
    `insert into cameras (token, created_at) values ($1, now()) on conflict (token) do nothing`,
    [token],
  );
}

export async function noteCreate(kind: CreateKind, token: string): Promise<void> {
  await sql(
    `insert into create_log (id, kind, camera_key) values ($1, $2, $3)`,
    [randomUUID(), kind, token],
  );
}
