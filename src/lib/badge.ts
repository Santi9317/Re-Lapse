import { isIosDevice, isStandaloneDisplay, readStorage, writeStorage } from "@/lib/shell";

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

/** This camera's answer to the iOS badge prompt. */
export const CAMERA_BADGE_PERMISSION_KEY = "relapse.badgePermission";
/** The gate's answer. iOS keeps a separate permission for that Home Screen app. */
export const GATE_BADGE_PERMISSION_KEY = "relapse.gateBadgePermission";

export type BadgePermission = "granted" | "denied" | "default";

export function readBadgePermission(raw: string | null): BadgePermission | null {
  if (raw === "granted" || raw === "denied" || raw === "default") return raw;
  return null;
}

/**
 * Ask iOS once, and only from an installed Home Screen app that can badge.
 * A stored answer, or a choice iOS already has, means later visits stay quiet.
 */
export function badgePermissionPlan(input: {
  ios: boolean;
  standalone: boolean;
  canBadge: boolean;
  stored: string | null;
  permission: string | null;
}): { ask: boolean; remember: BadgePermission | null } {
  if (!input.ios || !input.standalone || !input.canBadge) return { ask: false, remember: null };
  if (readBadgePermission(input.stored)) return { ask: false, remember: null };
  if (input.permission === "granted" || input.permission === "denied") {
    return { ask: false, remember: input.permission };
  }
  if (input.permission === "default") return { ask: true, remember: null };
  return { ask: false, remember: null };
}

type BadgePermissionHost = {
  Notification?: {
    permission?: string;
    requestPermission?: () => Promise<string>;
  };
};

function notificationBox(): BadgePermissionHost["Notification"] {
  return (globalThis as BadgePermissionHost).Notification;
}

function currentBadgePermission(): string | null {
  const permission = notificationBox()?.permission;
  return typeof permission === "string" ? permission : null;
}

function requestBadgePermission(): Promise<string> {
  const box = notificationBox();
  const ask = box?.requestPermission;
  if (!box || typeof ask !== "function") return Promise.resolve("default");
  return ask.call(box);
}

let badgeChoiceInFlight: Promise<BadgePermission | null> | null = null;

/**
 * Ask from the gesture that called this, and store granted, denied, or a dismissal.
 * A second call while that ask is open shares it, so one tap cannot prompt twice.
 */
export function rememberBadgeChoice(
  storage: Storage,
  key: string,
  request: () => Promise<string> = requestBadgePermission,
): Promise<BadgePermission | null> {
  if (badgeChoiceInFlight) return badgeChoiceInFlight;
  let started: Promise<string>;
  try {
    started = Promise.resolve(request());
  } catch {
    throw new Error("badge-permission-unavailable");
  }
  badgeChoiceInFlight = started
    .then((result) => {
      const remembered = readBadgePermission(result);
      if (remembered) writeStorage(storage, key, remembered);
      return remembered;
    })
    .finally(() => {
      badgeChoiceInFlight = null;
    });
  return badgeChoiceInFlight;
}

export function badgeChoiceLabel(choice: BadgePermission | null): string {
  if (choice === "granted") return "Allowed";
  if (choice === "denied") return "Not allowed";
  if (choice === "default") return "Not now";
  return "Not asked yet";
}

/**
 * What General shows for the home screen app's notification choice.
 * A granted or denied answer from the installed app replaces the stored one.
 * The page can ask again only while that app is still waiting for a choice.
 */
export function describeBadgeSetting(input: {
  ios: boolean;
  standalone: boolean;
  stored: string | null;
  permission: string | null;
}): {
  choice: BadgePermission | null;
  label: string;
  canAsk: boolean;
  onApp: boolean;
  sync: BadgePermission | null;
} {
  const stored = readBadgePermission(input.stored);
  const live = readBadgePermission(input.permission);
  const onApp = input.ios && input.standalone;
  if (onApp && (live === "granted" || live === "denied")) {
    return {
      choice: live,
      label: badgeChoiceLabel(live),
      canAsk: false,
      onApp,
      sync: stored === live ? null : live,
    };
  }
  return {
    choice: stored,
    label: badgeChoiceLabel(stored),
    canAsk: onApp && live === "default",
    onApp,
    sync: null,
  };
}

/**
 * Remember an iOS badge choice. The prompt itself runs on the next tap,
 * which is the gesture iOS requires, and that tap is the only ask.
 */
export function armBadgePermission(input: {
  storage: Storage;
  key: string;
  ios: boolean;
  standalone: boolean;
  canBadge: boolean;
  permission?: string | null;
  requestPermission?: () => Promise<string>;
  listen: (handler: () => void) => () => void;
}): () => void {
  const plan = badgePermissionPlan({
    ios: input.ios,
    standalone: input.standalone,
    canBadge: input.canBadge,
    stored: readStorage(input.storage, input.key),
    permission: input.permission === undefined ? currentBadgePermission() : input.permission,
  });
  if (plan.remember) {
    writeStorage(input.storage, input.key, plan.remember);
    return () => {};
  }
  if (!plan.ask) return () => {};
  const request = input.requestPermission ?? requestBadgePermission;
  let asked = false;
  let stop = () => {};
  stop = input.listen(() => {
    if (asked) return;
    let pending: Promise<BadgePermission | null>;
    try {
      pending = rememberBadgeChoice(input.storage, input.key, request);
    } catch {
      return;
    }
    asked = true;
    stop();
    void pending.catch(() => {});
  });
  return () => stop();
}

/** One tap on this installed iOS app asks, then the stored answer keeps later visits quiet. */
export function watchIosBadgePermission(key: string): () => void {
  if (typeof document === "undefined" || typeof navigator === "undefined") return () => {};
  const nav = navigator as Navigator & { standalone?: boolean };
  const host = iosBadgeHost({
    ua: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    displayStandalone: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: nav.standalone,
    canBadge: typeof nav.setAppBadge === "function",
  });
  return armBadgePermission({
    storage: localStorage,
    key,
    ...host,
    listen(handler) {
      document.addEventListener("click", handler, true);
      return () => document.removeEventListener("click", handler, true);
    },
  });
}

export function iosBadgeHost(input: {
  ua: string;
  platform: string;
  maxTouchPoints: number;
  displayStandalone: boolean;
  navigatorStandalone: boolean | undefined;
  canBadge: boolean;
}): { ios: boolean; standalone: boolean; canBadge: boolean } {
  return {
    ios: isIosDevice(input.ua, input.platform, input.maxTouchPoints),
    standalone: isStandaloneDisplay(input.displayStandalone, input.navigatorStandalone),
    canBadge: input.canBadge,
  };
}
