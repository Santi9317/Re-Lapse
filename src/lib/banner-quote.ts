import type { MainTab } from "./refresh";

/** Lab, Feed, Keepsakes, and You. Shoot leaves the viewfinder wordmark alone. */
export function bannerOpensQuote(tab: MainTab): tab is Exclude<MainTab, "shoot"> {
  return tab !== "shoot";
}
