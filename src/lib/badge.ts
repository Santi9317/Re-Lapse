/**
 * The Home Screen icon count. It is ready frames, unseen feed posts, and
 * timecapsules that have opened. The same checks the camera already uses.
 */

export function frameReadyToDevelop(photo: { labState: string; readyAt: number }, now: number): boolean {
  return photo.labState === "ready" || (photo.labState === "developing" && photo.readyAt <= now);
}

/**
 * A timecapsule that has opened. Keepsakes calls that roll Ready:
 * the window has closed, the seal is done, and the frames are back.
 */
export function timecapsuleOpened(event: { status: string }): boolean {
  return event.status === "ready";
}

export function appBadgeCount(readyFrames: number, unseenPosts: number, openedCapsules: number): number {
  return readyFrames + unseenPosts + openedCapsules;
}

/** Join requests plus retrievals. The gate already lists those two queues. */
export function gateBadgeCount(joinRequests: number, retrievals: number): number {
  return joinRequests + retrievals;
}

export type AppBadgeHost = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Paint the installed icon, or clear it at zero.
 * A platform that cannot badge leaves the count with the caller.
 */
export async function applyAppBadge(count: number, host: AppBadgeHost | null | undefined): Promise<void> {
  if (!host) return;
  try {
    if (count > 0) {
      if (typeof host.setAppBadge !== "function") return;
      await host.setAppBadge(count);
      return;
    }
    if (typeof host.clearAppBadge === "function") await host.clearAppBadge();
    else if (typeof host.setAppBadge === "function") await host.setAppBadge(0);
  } catch {
    /* this platform cannot badge the icon yet */
  }
}
