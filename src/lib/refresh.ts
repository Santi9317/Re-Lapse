export const MAIN_TABS = ["shoot", "lab", "feed", "rolls", "you"] as const;

export type MainTab = (typeof MAIN_TABS)[number];

/** Lists a landing reloads. Shoot is the live camera, so it has no list. */
export type TabList = "lab" | "feed" | "keepsakes" | "profile" | "guest";

/**
 * The screen you land on is the one that reloads.
 * A profile opened from a frame is in front of the tab, so that profile reloads.
 */
export function listsForLanding(tab: MainTab, guestOpen: boolean): readonly TabList[] {
  if (guestOpen) return ["guest"];
  switch (tab) {
    case "lab":
      return ["lab"];
    case "feed":
      return ["feed"];
    case "rolls":
      return ["keepsakes"];
    case "you":
      return ["profile"];
    case "shoot":
      return [];
  }
}

/** Moving from one main tab to another reloads the tab you land on. */
export function shouldReloadOnTabChange(from: MainTab, to: MainTab): boolean {
  return from !== to;
}

export type PageSignal = "show" | "hide" | "blur" | "focus";

/**
 * Coming back onto the open tab reloads it.
 * Hiding, blurring, and a focus tick leave the lists and the camera as they are.
 */
export function shouldReloadOnPageSignal(signal: PageSignal): boolean {
  return signal === "show";
}
