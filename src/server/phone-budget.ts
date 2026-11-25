import type { Sql } from "@/lib/db";

/**
 * The booth nobody has claimed yet. It is only the handoff.
 * A claimed booth keeps its own id, so one phone cannot spend another's allowance.
 */
export const SHARED_PHONE = "anonymous";

export function phoneBudget(phone: unknown): string {
  if (typeof phone !== "string") return SHARED_PHONE;
  const id = phone.trim();
  if (id.length === 0) return SHARED_PHONE;
  return id;
}

/** The phone this booth draws from. An unknown booth has no phone. */
export async function budgetPhone(q: Sql, boothId: string): Promise<string | null> {
  const rows = await q<{ phone: string | null }>(`select phone from issued_booths where id = $1`, [boothId]);
  if (!rows[0]) return null;
  return phoneBudget(rows[0].phone);
}
