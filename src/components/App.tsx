"use client";

import { useEffect, useRef, useState } from "react";
import { adoptSavedProfile, devFlagStored, ensureCamera, fetchConfig, fetchEvents, fetchFeed, fetchLab, joinEvent } from "@/lib/api";
import {
  CAMERA_BADGE_PERMISSION_KEY,
  appBadgeCount,
  applyAppBadge,
  frameReadyToDevelop,
  timecapsuleOpened,
  watchIosBadgePermission,
} from "@/lib/badge";
import { bannerOpensQuote } from "@/lib/banner-quote";
import { noteFeedLook } from "@/lib/feed-mark";
import { restorePhone } from "@/lib/identity";
import { drawInspiration, type Quote } from "@/lib/quotes";
import { shouldReloadOnPageSignal, shouldReloadOnTabChange, type MainTab } from "@/lib/refresh";
import type { EventRoll, FeedItem } from "@/lib/types";
import { Feed } from "@/components/Feed";
import { Lab } from "@/components/Lab";
import { GuestProfile, Profile } from "@/components/Profile";
import { QuoteDialog } from "@/components/QuoteDialog";
import { Rolls } from "@/components/Rolls";
import { ShellPrompts } from "@/components/Shell";
import { JoinGate } from "@/components/JoinGate";
import { ChoosePin } from "@/components/RecoveryPin";
import { Shoot } from "@/components/Shoot";

const lede: Record<Exclude<MainTab, "shoot">, string> = {
  lab: "Let them lapse. Develop when the clock hits zero, tinker with the bath. 🧪",
  feed: "Everyone with this link. A frame stays up for a week, then it lapses. ✨",
  rolls: "Your galleries, and timecapsules that open, then seal. 🎞️",
  you: "Set your name, photo, and three emojis. They show on the frames you share.",
};

export function App() {
  const [booted, setBooted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pinChosen, setPinChosen] = useState(false);
  useEffect(() => {
    void restorePhone().finally(() => {
      try {
        void navigator.storage?.persist?.();
      } catch {
        /* persistence is optional */
      }
      setBooted(true);
    });
  }, []);
  useEffect(() => watchIosBadgePermission(CAMERA_BADGE_PERMISSION_KEY), []);
  if (!booted) {
    return (
      <div className="desk">
        <div className="phone">
          <header className="top">
            <h1 className="word">Re-Lapse ✨</h1>
          </header>
          <div className="stage">
            <div className="scroll">
              <p className="fine">Checking the gate.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!open) return <JoinGate onOpen={() => setOpen(true)} />;
  if (!pinChosen) return <ChoosePin onReady={() => setPinChosen(true)} />;
  return <CameraDesk />;
}

function CameraDesk() {
  const [tab, setTab] = useState<MainTab>("shoot");
  const [landed, setLanded] = useState(0);
  const tabNow = useRef<MainTab>("shoot");
  tabNow.current = tab;
  const [armed, setArmed] = useState<EventRoll | null>(null);
  const [labRevision, setLabRevision] = useState(0);
  const [feedRevision, setFeedRevision] = useState(0);
  const [labCount, setLabCount] = useState(0);
  const [readyFrames, setReadyFrames] = useState<number | null>(null);
  const [unseenPosts, setUnseenPosts] = useState<number | null>(null);
  const [openedCapsules, setOpenedCapsules] = useState<number | null>(null);
  const labReady = (readyFrames ?? 0) > 0;
  const feedFresh = (unseenPosts ?? 0) > 0;
  const badgeCount =
    readyFrames != null && unseenPosts != null && openedCapsules != null
      ? appBadgeCount(readyFrames, unseenPosts, openedCapsules)
      : null;
  const [devTimers, setDevTimers] = useState(false);
  const [tokenReady, setTokenReady] = useState(0);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const [joinNotice, setJoinNotice] = useState("");
  const [bannerQuote, setBannerQuote] = useState<Quote | null>(null);
  const bannerRef = useRef<HTMLButtonElement>(null);

  function openBannerQuote() {
    setBannerQuote(drawInspiration(localStorage));
  }

  function closeBannerQuote() {
    setBannerQuote(null);
    bannerRef.current?.focus();
  }

  function chooseTab(next: MainTab) {
    setGuestId(null);
    if (shouldReloadOnTabChange(tabNow.current, next)) setLanded((value) => value + 1);
    setTab(next);
  }

  useEffect(() => {
    void ensureCamera()
      .then(() => adoptSavedProfile())
      .catch(() => undefined)
      .finally(() => setTokenReady((value) => value + 1));
    void fetchConfig().then((config) => setDevTimers(config.devTimers && devFlagStored()));
  }, []);

  useEffect(() => {
    // Coming back onto the open tab reloads its lists. The camera keeps its track.
    let shownAt = 0;
    const show = () => {
      if (!shouldReloadOnPageSignal("show")) return;
      const now = Date.now();
      if (now - shownAt < 500) return;
      shownAt = now;
      setLanded((value) => value + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") show();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", show);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", show);
    };
  }, []);

  useEffect(() => {
    if (!bannerOpensQuote(tab)) setBannerQuote(null);
  }, [tab]);

  useEffect(() => {
    if (tokenReady === 0) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (!code) return;
    let stop = false;
    void joinEvent(code)
      .then((event) => {
        if (stop) return;
        params.delete("join");
        const next = params.toString();
        window.history.replaceState(null, "", next ? `/?${next}` : "/");
        setJoinNotice("");
        setFocusEventId(event.id);
        chooseTab("rolls");
      })
      .catch((err: unknown) => {
        if (stop) return;
        params.delete("join");
        const next = params.toString();
        window.history.replaceState(null, "", next ? `/?${next}` : "/");
        setJoinNotice(err instanceof Error ? err.message : "That invite isn't one of ours.");
        chooseTab("rolls");
      });
    return () => {
      stop = true;
    };
  }, [tokenReady]);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const data = await fetchLab();
        if (stop) return;
        const now = Date.now();
        setLabCount(data.photos.length);
        setReadyFrames(data.photos.filter((photo) => frameReadyToDevelop(photo, now)).length);
      } catch {
        /* the badge can wait */
      }
      try {
        const events = await fetchEvents();
        if (stop) return;
        setOpenedCapsules(events.filter((event) => timecapsuleOpened(event)).length);
      } catch {
        /* the badge can wait */
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 8000);
    const onVis = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tokenReady, labRevision, feedRevision, landed]);

  useEffect(() => {
    if (tokenReady === 0 || (tab === "feed" && !guestId)) return;
    let stop = false;
    async function pull() {
      try {
        const data = await fetchFeed();
        if (stop) return;
        setUnseenPosts(
          noteFeedLook({
            storage: localStorage,
            photos: data.photos.map((photo) => ({ mine: photo.mine, addedAt: photo.addedAt })),
            feedVisible: false,
            now: Date.now(),
          }).count,
        );
      } catch {
        /* the badge can wait */
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 8000);
    const onVis = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tokenReady, feedRevision, tab, guestId, landed]);

  function sawFeed(photos: FeedItem[]) {
    setUnseenPosts(
      noteFeedLook({
        storage: localStorage,
        photos: photos.map((photo) => ({ mine: photo.mine, addedAt: photo.addedAt })),
        feedVisible: true,
        now: Date.now(),
      }).count,
    );
  }

  useEffect(() => {
    if (badgeCount == null) return;
    let stop = false;
    const paint = () => {
      if (!stop) void applyAppBadge(appBadgeCount(readyFrames ?? 0, unseenPosts ?? 0, openedCapsules ?? 0), navigator);
    };
    paint();
    const onVis = () => {
      if (document.visibilityState === "visible") paint();
    };
    document.addEventListener("visibilitychange", onVis);
    const mode = window.matchMedia("(display-mode: standalone)");
    mode.addEventListener("change", paint);
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", onVis);
      mode.removeEventListener("change", paint);
    };
  }, [badgeCount, readyFrames, unseenPosts, openedCapsules]);

  return (
    <div className="desk">
      <div className={tab === "shoot" ? "phone" : "phone pin-tabs"}>
        {bannerOpensQuote(tab) ? (
          <header className="top">
            <h1 className="word">
              <button ref={bannerRef} type="button" onClick={openBannerQuote}>
                Re-Lapse ✨
              </button>
            </h1>
            <p className="lede">{guestId ? "Their profile, from a frame they shared." : lede[tab]}</p>
          </header>
        ) : null}
        {devTimers ? <p className="devmark">Lab clock</p> : null}
        <div className="stage">
          <div className="shoot-slot" hidden={tab !== "shoot"}>
            <Shoot
              active={tab === "shoot"}
              armed={armed}
              onDisarm={() => setArmed(null)}
              onSent={() => {
                setLabRevision((value) => value + 1);
                setLabCount((count) => count + 1);
              }}
            />
          </div>
          {tab === "lab" ? (
            <Lab
              revision={labRevision}
              refresh={landed}
              onPublished={() => {
                setFeedRevision((value) => value + 1);
                setLabRevision((value) => value + 1);
                chooseTab("feed");
              }}
              onDeleted={() => setLabCount((count) => Math.max(0, count - 1))}
            />
          ) : null}
          {guestId ? (
            <GuestProfile id={guestId} refresh={landed} onBack={() => setGuestId(null)} />
          ) : (
            <>
              {tab === "feed" ? <Feed revision={feedRevision} refresh={landed} onOpenProfile={setGuestId} onSeen={sawFeed} /> : null}
              {tab === "you" ? <Profile revision={feedRevision} refresh={landed} /> : null}
              {tab === "rolls" ? (
                <Rolls
                  revision={feedRevision}
                  refresh={landed}
                  focusEventId={focusEventId}
                  joinNotice={joinNotice}
                  onArm={(event) => {
                    setArmed(event);
                    chooseTab("shoot");
                  }}
                  onOpenProfile={setGuestId}
                  onShared={() => setFeedRevision((value) => value + 1)}
                  onFocusConsumed={() => setFocusEventId(null)}
                />
              ) : null}
            </>
          )}
        </div>
        <nav className="nav">
          {(
            [
              ["shoot", "Shoot", "📸"],
              ["lab", "Lab", "🧪"],
              ["feed", "Feed", "✨"],
              ["rolls", "Keepsakes", "🎞️"],
              ["you", "You", "🪪"],
            ] as const
          ).map(([id, label, emoji]) => (
            <button key={id} type="button" aria-pressed={tab === id && !guestId} onClick={() => chooseTab(id)}>
              <span className="nav-emoji" aria-hidden="true">{emoji}</span>
              {label}
              {id === "lab" && labReady ? <i className="dot" aria-label="Ready to develop" /> : null}
              {id === "lab" && !labReady && labCount > 0 ? <sup>{labCount}</sup> : null}
              {id === "feed" && feedFresh ? <i className="dot" aria-label="New photos" /> : null}
            </button>
          ))}
        </nav>
        {bannerQuote ? <QuoteDialog quote={bannerQuote} onClose={closeBannerQuote} /> : null}
        <ShellPrompts />
      </div>
    </div>
  );
}
