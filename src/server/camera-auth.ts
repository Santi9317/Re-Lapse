const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROOF = /^[0-9a-f]{64}$/i;

/** A document load can refresh the phone cookie. API responses set it themselves. */
export function shouldRefreshPhoneCookie(method: string, pathname: string): boolean {
  if (method !== "GET") return false;
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || pathname.startsWith("/icons/")) return false;
  return true;
}

export function boothFromCookie(cookieHeader: string | null): string | null {
  const header = cookieHeader ?? "";
  const prefix = "relapse_booth=";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    let value = "";
    try {
      value = decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      return null;
    }
    if (!UUID.test(value)) return null;
    return value.toLowerCase();
  }
  return null;
}

/** The camera sealed in the httpOnly cookie. A request header is not a proof. */
export function cameraAuthFromCookie(cookieHeader: string | null): { token: string; proof: string } | null {
  const header = cookieHeader ?? "";
  const prefix = "relapse_auth=";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    let value = "";
    try {
      value = decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      return null;
    }
    const dot = value.indexOf(".");
    if (dot < 0) continue;
    const token = value.slice(0, dot);
    const proof = value.slice(dot + 1);
    if (!UUID.test(token) || !PROOF.test(proof)) continue;
    return { token: token.toLowerCase(), proof: proof.toLowerCase() };
  }
  return null;
}
