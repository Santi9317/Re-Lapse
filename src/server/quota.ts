import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { isUuid } from "@/server/validate";

/**
 * Each camera has its own window. Nothing here is a shared pool: not new
 * cameras, and not photos, rolls, events, profiles, or invite guesses. The
 * browser cannot mint an id. A camera is a server id plus a proof only this
 * server can make. A camera row is written only when that camera stores
 * something, and only after its own window still has room. Address headers
 * are not read. One camera cannot spend another's window.
 */
const QUOTA = {
  photo: { windowMs: 10 * 60_000, limit: 12 },
  album: { windowMs: 60 * 60_000, limit: 4 },
  event: { windowMs: 60 * 60_000, limit: 2 },
  profile: { windowMs: 60 * 60_000, limit: 4 },
  join: { windowMs: 60 * 60_000, limit: 8 },
} as const;

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

async function cameraIsIssued(token: string, proof: string | null): Promise<boolean> {
  if (await cameraExists(token)) return true;
  return proofMatches(token, proof);
}

export async function issueCamera(
  presented: string | null,
  proof: string | null,
): Promise<{ token: string; proof: string }> {
  if (presented && isUuid(presented)) {
    const token = presented.toLowerCase();
    if (await cameraIsIssued(token, proof)) {
      return { token, proof: await cameraProof(token) };
    }
  }
  const token = randomUUID();
  return { token, proof: await cameraProof(token) };
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
