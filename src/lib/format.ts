import { FEED_TTL_MS } from "@/lib/clock";

export function frames(count: number): string {
  return `${count} ${count === 1 ? "frame" : "frames"}`;
}

export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function longRemain(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
  }
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return countdown(ms);
}

export function ago(ms: number, now = Date.now()): string {
  const seconds = Math.max(0, now - ms) / 1000;
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function leavesIn(sortAt: number, now = Date.now()): string {
  const left = sortAt + FEED_TTL_MS - now;
  if (left <= 0) return "leaving now";
  const day = 86_400_000;
  if (left >= day) return `gone in ${Math.ceil(left / day)}d`;
  const hour = 3_600_000;
  if (left >= hour) return `gone in ${Math.ceil(left / hour)}h`;
  return `gone in ${Math.max(1, Math.ceil(left / 60_000))}m`;
}

export function clockLabel(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A `datetime-local` value in the viewer's local time, to the minute. */
export function dateTimeLocalValue(ms: number): string {
  const date = new Date(ms);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The local minute from a `datetime-local` value, or null when it is not one. */
export function dateTimeLocalMs(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function disposableDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(2);
  return `${month} ${day} '${year}`;
}
