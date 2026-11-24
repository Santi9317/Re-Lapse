"use client";

import { useEffect, useState } from "react";
import { devFlagStored, ensureCamera, fetchConfig, fetchLab, joinEvent } from "@/lib/api";
import { isSafariUa } from "@/lib/shell";
import type { EventRoll } from "@/lib/types";
import { Feed } from "@/components/Feed";
import { Lab } from "@/components/Lab";
import { GuestProfile, Profile } from "@/components/Profile";
import { Rolls } from "@/components/Rolls";
import { ShellPrompts } from "@/components/Shell";
import { JoinGate } from "@/components/JoinGate";
import { Shoot } from "@/components/Shoot";

type Tab = "shoot" | "lab" | "feed" | "rolls" | "you";
type InstallPrompt = Event & { prompt: () => Promise<void> };

const lede: Record<Exclude<Tab, "shoot">, string> = {
  lab: "Let them lapse. Develop when the clock hits zero. 🧪",
  feed: "Everyone with this link. A frame stays up for a week, then it lapses. ✨",
  rolls: "Invite people onto a roll, let it lapse, then pick the feed. 🎞️",
  you: "Set your name, photo, and three emojis. They show on the frames you share.",
};

export function App() {
  const [open, setOpen] = useState(false);
  if (!open) return <JoinGate onOpen={() => setOpen(true)} />;
  return <CameraDesk />;
}

function CameraDesk() {
  const [tab, setTab] = useState<Tab>("shoot");
  const [armed, setArmed] = useState<EventRoll | null>(null);
  const [labRevision, setLabRevision] = useState(0);
  const [feedRevision, setFeedRevision] = useState(0);
  const [labCount, setLabCount] = useState(0);
  const [labReady, setLabReady] = useState(false);
  const [devTimers, setDevTimers] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [hideInstall, setHideInstall] = useState(true);
  const [tokenReady, setTokenReady] = useState(0);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const [joinNotice, setJoinNotice] = useState("");

  function chooseTab(next: Tab) {
    setGuestId(null);
    setTab(next);
  }

  useEffect(() => {
    void ensureCamera()
      .catch(() => undefined)
      .finally(() => setTokenReady((value) => value + 1));
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setHideInstall(localStorage.getItem("relapse.hideInstall") === "1" || standalone);
    void fetchConfig().then((config) => setDevTimers(config.devTimers && devFlagStored()));
    const onPrompt = (event: Event) => {
      if (isSafariUa(navigator.userAgent)) return;
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

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
        setGuestId(null);
        setTab("rolls");
      })
      .catch((err: unknown) => {
        if (stop) return;
        params.delete("join");
        const next = params.toString();
        window.history.replaceState(null, "", next ? `/?${next}` : "/");
        setJoinNotice(err instanceof Error ? err.message : "That invite isn't one of ours.");
        setGuestId(null);
        setTab("rolls");
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
        setLabCount(data.photos.length);
        setLabReady(data.photos.some((photo) => photo.labState === "ready" || (photo.labState === "developing" && photo.readyAt <= Date.now())));
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
  }, [tokenReady, labRevision, feedRevision]);

  function dismissInstall() {
    localStorage.setItem("relapse.hideInstall", "1");
    setHideInstall(true);
  }

  const safari = typeof navigator !== "undefined" && isSafariUa(navigator.userAgent);

  return (
    <div className="desk">
      <div className="phone">
        {tab !== "shoot" ? (
          <header className="top">
            <h1 className="word">Re-Lapse ✨</h1>
            <p className="lede">{guestId ? "Their profile, from a frame they shared." : lede[tab]}</p>
          </header>
        ) : null}
        {devTimers ? <p className="devmark">Lab clock</p> : null}
        <div className="stage">
          <div className="shoot-slot" hidden={tab !== "shoot"}>
            <Shoot
              active={tab === "shoot"}
              armed={armed}
              devTimers={devTimers}
              onDisarm={() => setArmed(null)}
              onSent={() => {
                setLabRevision((value) => value + 1);
                chooseTab("lab");
              }}
            />
          </div>
          {tab === "lab" ? (
            <Lab
              revision={labRevision}
              onPublished={() => {
                setFeedRevision((value) => value + 1);
                setLabRevision((value) => value + 1);
                chooseTab("feed");
              }}
              onDeleted={() => setLabCount((count) => Math.max(0, count - 1))}
            />
          ) : null}
          {guestId ? (
            <GuestProfile id={guestId} onBack={() => setGuestId(null)} />
          ) : (
            <>
              {tab === "feed" ? <Feed revision={feedRevision} onOpenProfile={setGuestId} /> : null}
              {tab === "you" ? <Profile revision={feedRevision} /> : null}
              {tab === "rolls" ? (
                <Rolls
                  revision={feedRevision}
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
        {!hideInstall && !safari ? (
          <div className="install">
            <span>
              {install ? "Keep the camera on your home screen." : <>Add <span className="namemark">Re-Lapse</span> to your home screen.</>}
            </span>
            {install ? (
              <button
                type="button"
                onClick={() => {
                  void install.prompt();
                  setInstall(null);
                }}
              >
                Install
              </button>
            ) : (
              <button type="button" onClick={dismissInstall}>
                Hide
              </button>
            )}
          </div>
        ) : null}
        <nav className="nav">
          {(
            [
              ["shoot", "Shoot", "📸"],
              ["lab", "Lab", "🧪"],
              ["feed", "Feed", "✨"],
              ["rolls", "Rolls", "🎞️"],
              ["you", "You", "🪪"],
            ] as const
          ).map(([id, label, emoji]) => (
            <button key={id} type="button" aria-pressed={tab === id && !guestId} onClick={() => chooseTab(id)}>
              <span className="nav-emoji" aria-hidden="true">{emoji}</span>
              {label}
              {id === "lab" && labReady ? <i className="dot" aria-label="Ready to develop" /> : null}
              {id === "lab" && !labReady && labCount > 0 ? <sup>{labCount}</sup> : null}
            </button>
          ))}
        </nav>
        <ShellPrompts />
      </div>
    </div>
  );
}
