const DATE_STAMP_KEY = "relapse.date-stamp";

/** The Lab switch. On unless this camera has turned it off. */
export function readDateStamp(): boolean {
  try {
    return localStorage.getItem(DATE_STAMP_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeDateStamp(on: boolean): void {
  try {
    localStorage.setItem(DATE_STAMP_KEY, on ? "on" : "off");
  } catch {
    /* the switch still applies to prints developed in this visit */
  }
}

/** The capture time drawn on a print when the Lab switch is on. */
export function developStampDate(enabled: boolean, capturedAt: number | null): Date | undefined {
  if (!enabled || capturedAt == null) return undefined;
  const date = new Date(capturedAt);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date;
}
