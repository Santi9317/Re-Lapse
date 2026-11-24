import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Local portal key used only when RELAPSE_ADMIN_TOKEN is unset and this
 * process has no DATABASE_URL. The hosted app always has a database, so the
 * fallback stays off there. The value is documented in the README and is
 * never written to the log.
 */
export const LOCAL_GATE_KEY = "relapse-local-gate";

export function resolveGateSecret(token: string | undefined, databaseUrl: string | undefined): string | null {
  const configured = token?.trim() ?? "";
  if (configured.length > 0) return configured;
  if ((databaseUrl?.trim() ?? "") === "") return LOCAL_GATE_KEY;
  return null;
}

export function gateSecret(): string | null {
  return resolveGateSecret(process.env.RELAPSE_ADMIN_TOKEN, process.env.DATABASE_URL);
}

export function sameSecret(given: string, expected: string): boolean {
  const left = createHash("sha256").update(given).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function gateCookie(secret: string): string {
  return createHmac("sha256", secret).update("relapse-gate-v1").digest("hex");
}
