/**
 * Version shown in the You menu. Bump it on every merged PR.
 * A small change adds 0.1 (1.36 then 1.37). A major change bumps the whole
 * number and resets the decimal (2.0). On 1.x the decimal is this PR's number.
 * Keep package.json "version" equal to this string.
 */
export const APP_VERSION = "1.52";

export type Release = {
  version: string;
  sha: string;
  short: string;
  iso: string;
  date: string;
};

/** The commit baked into this build, dated in Eastern time so the day does not drift. */
export function loadRelease(): Release | null {
  const version = process.env.NEXT_PUBLIC_RELEASE_VERSION ?? "";
  const sha = process.env.NEXT_PUBLIC_RELEASE_SHA ?? "";
  const iso = process.env.NEXT_PUBLIC_RELEASE_AT ?? "";
  const parsed = Date.parse(iso);
  if (!version || !sha || Number.isNaN(parsed)) return null;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(parsed));
  return { version, sha, short: sha.slice(0, 7), iso, date };
}
