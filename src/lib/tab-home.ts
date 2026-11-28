import type { MainTab } from "./refresh";

/** A tap on the tab that is already open asks that tab for its home screen. */
export function tabTapHomes(current: MainTab, tapped: MainTab): boolean {
  return current === tapped;
}
