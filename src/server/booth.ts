import { randomUUID } from "node:crypto";
import { withTransaction, type Sql } from "@/lib/db";
import { BOOTH_LIMITS, boothRoom } from "@/server/booth-line";
import { HttpError } from "@/server/http";
import { isUuid } from "@/server/validate";

export { BOOTH_LIMITS, boothRoom };

function countOf(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function lockIssue(q: Sql): Promise<void> {
  await q(`insert into booth_issue_lock (id) values (1) on conflict (id) do nothing`);
  await q(`select id from booth_issue_lock where id = 1 for update`);
}

/**
 * Returns the booth this browser may use. An id we already issued is kept.
 * An id that already has a camera, a join, or a rescue is kept too, so a
 * phone from before this list still has its own window. Anything else is a
 * new phone and spends the shared window. The presented value is not trusted.
 */
export async function adoptBooth(presented: string): Promise<string> {
  const candidate = isUuid(presented) ? presented.toLowerCase() : "";
  return withTransaction(async (q) => {
    await lockIssue(q);
    if (candidate) {
      const known = await q<{ id: string }>(`select id from issued_booths where id = $1`, [candidate]);
      if (known[0]) return candidate;
      const used = await q<{ id: string }>(
        `select booth as id from camera_mints where booth = $1
         union all
         select booth from join_requests where booth = $1
         union all
         select booth from recovery_requests where booth = $1
         limit 1`,
        [candidate],
      );
      if (used[0]) {
        await q(
          `insert into issued_booths (id, created_at)
           values ($1, now() - interval '1 day')
           on conflict (id) do nothing`,
          [candidate],
        );
        return candidate;
      }
    }
    const recent = await q<{ n: number }>(
      `select count(*)::int as n
       from issued_booths
       where created_at > now() - ($1::int * interval '1 millisecond')`,
      [BOOTH_LIMITS.windowMs],
    );
    if (!boothRoom(countOf(recent[0]?.n))) {
      throw new HttpError(429, "The line is full. Try again shortly.");
    }
    const id = randomUUID();
    await q(`insert into issued_booths (id, created_at) values ($1, now())`, [id]);
    return id;
  });
}
