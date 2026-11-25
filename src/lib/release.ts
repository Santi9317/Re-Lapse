/**
 * Version shown in the You menu. Bump it for every publish, by the change.
 * A fix bumps the patch (1.80.1, then 1.80.2). A feature bumps the minor
 * and resets the patch (1.81.0). A breaking change bumps the major and
 * resets the rest (2.0.0).
 * Keep package.json "version" equal to this string.
 * Keep public/sw.js RELEASE_VERSION and public/release.json "version" equal to it,
 * and write only this publish's notes in src/lib/release-notes.ts and public/release.json.
 * Shortcut icon URLs in the manifests and public/sw.js include this version.
 * public/release.json "icon" and "previousIcon" match src/lib/icon-prompt.ts.
 * The Home Screen prompt shows only when those digests differ.
 */
export const APP_VERSION = "1.80.1";

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
