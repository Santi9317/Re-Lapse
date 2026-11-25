"use client";

import { useEffect, useState } from "react";
import {
  CAMERA_BADGE_PERMISSION_KEY,
  describeBadgeSetting,
  iosBadgeHost,
  rememberBadgeChoice,
} from "@/lib/badge";
import { readStorage, writeStorage } from "@/lib/shell";

type BadgeSetting = ReturnType<typeof describeBadgeSetting>;

function currentBadgeSetting(): BadgeSetting {
  const nav = navigator as Navigator & { standalone?: boolean };
  const host = iosBadgeHost({
    ua: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    displayStandalone: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: nav.standalone,
    canBadge: typeof nav.setAppBadge === "function",
  });
  const box = (globalThis as { Notification?: { permission?: string } }).Notification;
  const permission = typeof box?.permission === "string" ? box.permission : null;
  const described = describeBadgeSetting({
    ios: host.ios,
    standalone: host.standalone,
    stored: readStorage(localStorage, CAMERA_BADGE_PERMISSION_KEY),
    permission,
  });
  if (described.sync) writeStorage(localStorage, CAMERA_BADGE_PERMISSION_KEY, described.sync);
  return described.sync ? { ...described, sync: null } : described;
}

/** General is the You menu's settings list. The icon count is the first one. */
export function GeneralSettings() {
  const [setting, setSetting] = useState<BadgeSetting | null>(null);

  useEffect(() => {
    setSetting(currentBadgeSetting());
    const onVis = () => {
      if (document.visibilityState === "visible") setSetting(currentBadgeSetting());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function onChange() {
    const next = currentBadgeSetting();
    if (!next.canAsk) {
      setSetting(next);
      return;
    }
    void rememberBadgeChoice(localStorage, CAMERA_BADGE_PERMISSION_KEY)
      .then(() => setSetting(currentBadgeSetting()))
      .catch(() => setSetting(currentBadgeSetting()));
  }

  const choice = setting?.choice ?? null;

  return (
    <div className="sleeve-copy" data-general-settings>
      <h2 className="section">General</h2>
      <p>Settings for this home screen app.</p>
      <div className="sleeve-list" data-general-list>
        <div className="general-setting" data-general-setting="badge">
          <strong>Icon count</strong>
          <span data-badge-choice={choice ?? "unset"}>{setting?.label ?? "Not asked yet"}</span>
          {setting?.canAsk ? (
            <>
              <button className="primary" type="button" data-badge-change onClick={onChange}>
                Change
              </button>
              <p>Change asks iOS. Later visits do not ask on their own.</p>
            </>
          ) : null}
          {setting?.onApp && !setting.canAsk && (choice === "granted" || choice === "denied") ? (
            <p>iOS is keeping this choice. Change it in this app&apos;s notification settings, then come back.</p>
          ) : null}
          {setting && !setting.canAsk && !setting.onApp ? (
            <p>The home screen app on iOS asks once, and keeps the answer here.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
