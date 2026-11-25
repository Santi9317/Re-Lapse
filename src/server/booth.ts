import { randomUUID } from "node:crypto";
import { withTransaction, type Sql } from "@/lib/db";
import { boothKind } from "@/server/booth-line";
import { isUuid } from "@/server/validate";

export { boothKind };

const EMPTY_KEEP = 40;

function countOf(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function lockIssue(q: Sql): Promise<void> {
  await q(`insert into booth_issue_lock (id) values (1) on conflict (id) do nothing`);
  await q(`select id from booth_issue_lock where id = 1 for update`);
}

async function readOpen(q: Sql): Promise<string> {
  const rows = await q<{ open_id: string | null }>(`select open_id from booth_issue_lock where id = 1`);
  const id = rows[0]?.open_id ? String(rows[0].open_id) : "";
  if (!isUuid(id)) return "";
  const issued = await q<{ id: string }>(`select id from issued_booths where id = $1`, [id.toLowerCase()]);
  return issued[0] ? id.toLowerCase() : "";
}

async function ensureOpen(q: Sql): Promise<string> {
  const current = await readOpen(q);
  if (current) return current;
  const id = randomUUID();
  await q(`insert into issued_booths (id, created_at) values ($1, now())`, [id]);
  await q(`update booth_issue_lock set open_id = $1 where id = 1`, [id]);
  return id;
}

async function isPrivate(q: Sql, id: string): Promise<boolean> {
  const known = await q<{ id: string }>(`select id from issued_booths where id = $1`, [id]);
  if (known[0]) return true;
  const used = await q<{ id: string }>(
    `select booth as id from camera_mints where booth = $1
     union all
     select booth from join_requests where booth = $1
     union all
     select booth from recovery_requests where booth = $1
     limit 1`,
    [id],
  );
  if (!used[0]) return false;
  await q(
    `insert into issued_booths (id, created_at)
     values ($1, now() - interval '1 day')
     on conflict (id) do nothing`,
    [id],
  );
  return true;
}

async function trimEmpty(q: Sql, owned: string, open: string): Promise<void> {
  const extra = await q<{ n: number }>(
    `select count(*)::int as n
     from issued_booths b
     where b.id <> $1
       and b.id <> $2
       and not exists (select 1 from camera_mints m where m.booth = b.id)
       and not exists (select 1 from join_requests j where j.booth = b.id)
       and not exists (select 1 from recovery_requests r where r.booth = b.id)`,
    [owned, open],
  );
  if (countOf(extra[0]?.n) <= EMPTY_KEEP) return;
  await q(
    `delete from issued_booths
     where id in (
       select b.id
       from issued_booths b
       where b.id <> $1
         and b.id <> $2
         and not exists (select 1 from camera_mints m where m.booth = b.id)
         and not exists (select 1 from join_requests j where j.booth = b.id)
         and not exists (select 1 from recovery_requests r where r.booth = b.id)
       order by b.created_at desc
       offset $3
     )`,
    [owned, open, EMPTY_KEEP],
  );
}

/**
 * The booth this browser may use.
 * An id we already issued is kept. An id that already has a camera, a join,
 * or a rescue is kept too. Anything else shares one open booth, so a missing
 * cookie does not take a new phone. Bringing that open booth back gives this
 * browser its own id. `shared` means the cookie still has to be stored.
 * `fresh` means this id was just handed out and must not start its own budget.
 */
export async function prepareBooth(
  presented: string,
): Promise<{ id: string; shared: boolean; fresh: boolean }> {
  const candidate = isUuid(presented) ? presented.toLowerCase() : "";
  return withTransaction(async (q) => {
    await lockIssue(q);
    const open = await ensureOpen(q);
    const showingOpen = candidate.length > 0 && candidate === open;
    const known = candidate.length > 0 && !showingOpen ? await isPrivate(q, candidate) : false;
    const kind = boothKind(candidate.length > 0, showingOpen, known);
    if (kind === "keep") return { id: candidate, shared: false, fresh: false };
    if (kind === "claim") {
      const owned = randomUUID();
      const next = randomUUID();
      await q(
        `insert into issued_booths (id, created_at) values ($1, now()), ($2, now())`,
        [owned, next],
      );
      await q(`update booth_issue_lock set open_id = $1 where id = 1`, [next]);
      await q(
        `delete from issued_booths
         where id = $1
           and not exists (select 1 from camera_mints m where m.booth = $1)
           and not exists (select 1 from join_requests j where j.booth = $1)
           and not exists (select 1 from recovery_requests r where r.booth = $1)`,
        [open],
      );
      await trimEmpty(q, owned, next);
      return { id: owned, shared: false, fresh: true };
    }
    return { id: open, shared: true, fresh: false };
  });
}

/** The booth id from prepareBooth. A shared id still has to be stored. */
export async function adoptBooth(presented: string): Promise<string> {
  return (await prepareBooth(presented)).id;
}
