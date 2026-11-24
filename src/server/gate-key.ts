import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * The gate opens only with RELAPSE_ADMIN_TOKEN from the environment.
 * There is no built-in key. A missing token leaves the portal shut.
 */
export const GATE_GUESS_LIMIT = 8;
export const GATE_CLIENT_LIMIT = 4;
export const GATE_GUESS_DELAY_MS = 400;

export function resolveGateSecret(token: string | undefined): string | null {
  const configured = token?.trim() ?? "";
  return configured.length > 0 ? configured : null;
}

export function gateSecret(): string | null {
  return resolveGateSecret(process.env.RELAPSE_ADMIN_TOKEN);
}

export function gateGuessBlocked(recentFailures: number): boolean {
  return Number.isFinite(recentFailures) && recentFailures >= GATE_GUESS_LIMIT;
}

/**
 * A guess is checked only when this browser is still under its own limit.
 * A brand-new browser is also refused once enough other browsers are already
 * in the window, so dropping the cookie does not open a fresh budget.
 */
export function guessMayCompare(failures: number, otherClients: number, isNewClient: boolean): boolean {
  if (!Number.isFinite(failures) || failures < 0) return false;
  if (!Number.isFinite(otherClients) || otherClients < 0) return false;
  if (failures >= GATE_GUESS_LIMIT) return false;
  if (isNewClient && otherClients >= GATE_CLIENT_LIMIT) return false;
  return true;
}

export function sameSecret(given: string, expected: string): boolean {
  const left = createHash("sha256").update(given).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function gateCookie(secret: string): string {
  return createHmac("sha256", secret).update("relapse-gate-v1").digest("hex");
}
