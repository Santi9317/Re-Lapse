"use client";

import { useEffect, useState } from "react";
import { devFlagStored, fetchConfig, fetchLab, shooterToken } from "@/lib/api";
import type { EventRoll } from "@/lib/types";
import { Feed } from "@/components/Feed";
import { Lab } from "@/components/Lab";
import { Profile } from "@/components/Profile";
import { Rolls } from "@/components/Rolls";
import { Shoot } from "@/components/Shoot";

type Tab = "shoot" | "lab" | "feed" | "rolls" | "you";
type InstallPrompt = Event & { prompt: () => Promise<void> };

const lede: Record<Exclude<Tab, "shoot">, string> = {
  lab: "Hidden until you develop them. Only the frames you send reach the feed.",
  feed: "Everyone with this link. Newest shared frames first.",
  rolls: "Little rolls, and events that come back from the lab.",
  you: "Your profile, on this device.",
};

export function App() {
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

  useEffect(() => {
    shooterToken();
    setTokenReady((value) => value + 1);
    setHideInstall(localStorage.getItem("relapse.hideInstall") === "1" || window.matchMedia("(display-mode: standalone)").matches);
    void fetchConfig().then((config) => setDevTimers(config.devTimers && devFlagStored()));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

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

  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div className="desk">
      <div className="phone">
        {tab !== "shoot" ? (
          <header className="top">
            <h1 className="word">Relapse</h1>
            <p className="lede">{lede[tab]}</p>
          </header>
        ) : null}
        {devTimers ? <p className="devmark">Lab clock</p> : null}
        <div className="stage">
          {tab === "shoot" ? (
            <Shoot
              armed={armed}
              devTimers={devTimers}
              onDisarm={() => setArmed(null)}
              onSent={() => {
                setLabRevision((value) => value + 1);
                setTab("lab");
              }}
            />
          ) : null}
          {tab === "lab" ? (
            <Lab
              revision={labRevision}
              onPublished={() => {
                setFeedRevision((value) => value + 1);
                setLabRevision((value) => value + 1);
                setTab("feed");
              }}
            />
          ) : null}
          {tab === "feed" ? <Feed revision={feedRevision} /> : null}
          {tab === "you" ? <Profile revision={feedRevision} /> : null}
          {tab === "rolls" ? (
            <Rolls
              revision={feedRevision}
              onArm={(event) => {
                setArmed(event);
                setTab("shoot");
              }}
            />
          ) : null}
        </div>
        {!hideInstall ? (
          <div className="install">
            <span>
              {install
                ? "Keep the camera on your home screen."
                : ios
                  ? "Share, then Add to Home Screen."
                  : "Add Relapse to your home screen."}
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
              ["shoot", "Shoot"],
              ["lab", "Lab"],
              ["feed", "Feed"],
              ["rolls", "Rolls"],
              ["you", "You"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
              {id === "lab" && labReady ? <i className="dot" aria-label="Ready to develop" /> : null}
              {id === "lab" && !labReady && labCount > 0 ? <sup>{labCount}</sup> : null}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
