export const HOME_CHOICE_KEY = "relapse.safariHome";
export const LEGACY_HIDE_INSTALL_KEY = "relapse.hideInstall";
export const UPDATE_ACCEPT_KEY = "relapse.updateAccepted";
export const UPDATE_RELOAD_KEY = "relapse.updateDidReload";
export const NOTES_SEEN_KEY = "relapse.notesSeen";

const NOT_SAFARI =
  /Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|EdgA|OPR|OPiOS|SamsungBrowser|Android|DuckDuckGo|FBAN|FBAV|Instagram|GSA\//i;

export function isSafariUa(ua: string): boolean {
  if (NOT_SAFARI.test(ua)) return false;
  return /Safari/i.test(ua);
}

export function isIosDevice(ua: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function isStandaloneDisplay(displayStandalone: boolean, navigatorStandalone: boolean | undefined): boolean {
  return displayStandalone || navigatorStandalone === true;
}

export function shouldAskForHome(input: {
  safari: boolean;
  standalone: boolean;
  stored: string | null;
  legacyHidden: boolean;
}): boolean {
  if (!input.safari || input.standalone) return false;
  if (input.stored === "yes" || input.stored === "no") return false;
  if (input.legacyHidden) return false;
  return true;
}

export type UpdateDecision = "show" | "finish" | "idle";

export function updateDecision(input: {
  hasController: boolean;
  hasActive: boolean;
  hasWaiting: boolean;
  accepted: boolean;
}): UpdateDecision {
  // A homescreen launch can already have an active worker and a waiting one
  // before this page is claimed. The first install has neither, so it stays quiet.
  const running = input.hasController || input.hasActive;
  if (!running || !input.hasWaiting) return "idle";
  return input.accepted ? "finish" : "show";
}

export function shouldClearUpdateAcceptance(input: { hasWaiting: boolean; hasInstalling: boolean }): boolean {
  return !input.hasWaiting && !input.hasInstalling;
}

export function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function clearStorage(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    /* private mode */
  }
}
