"use client";

import { useEffect, useRef, useState } from "react";
import {
  HOME_CHOICE_KEY,
  LEGACY_HIDE_INSTALL_KEY,
  NOTES_SEEN_KEY,
  UPDATE_ACCEPT_KEY,
  UPDATE_RELOAD_KEY,
  clearStorage,
  isIosDevice,
  isSafariUa,
  isStandaloneDisplay,
  readStorage,
  shouldAskForHome,
  shouldClearUpdateAcceptance,
  updateDecision,
  writeStorage,
} from "@/lib/shell";
import {
  RELEASE_NOTES,
  notesControlForUpdate,
  publishedReleaseFromJson,
  type PublishedRelease,
} from "@/lib/release-notes";
import { APP_VERSION } from "@/lib/release";
import { snapshotPhone } from "@/lib/identity";

type InstallPrompt = Event & { prompt: () => Promise<void> };
type StandaloneNavigator = Navigator & { standalone?: boolean };

function standaloneNow(): boolean {
  return isStandaloneDisplay(
    window.matchMedia("(display-mode: standalone)").matches,
    (navigator as StandaloneNavigator).standalone,
  );
}

function rememberHome(choice: "yes" | "no") {
  writeStorage(localStorage, HOME_CHOICE_KEY, choice);
  writeStorage(localStorage, LEGACY_HIDE_INSTALL_KEY, "1");
}

export function ShellPrompts() {
  const [updateOpen, setUpdateOpen] = useState(false);
  const [developing, setDeveloping] = useState(false);
  const [homeAsk, setHomeAsk] = useState(false);
  const [steps, setSteps] = useState<"ios" | "desk" | null>(null);
  const [releaseReady, setReleaseReady] = useState(false);
  const [published, setPublished] = useState<PublishedRelease | null>(null);
  const [notesLines, setNotesLines] = useState<readonly string[] | null>(null);
  const [notesVersion, setNotesVersion] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const installPrompt = useRef<InstallPrompt | null>(null);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    let dropped = false;
    void fetch("/release.json", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (dropped) return;
        setPublished(publishedReleaseFromJson(body));
        setReleaseReady(true);
      })
      .catch(() => {
        if (!dropped) setReleaseReady(true);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      dropped = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!updateOpen || !releaseReady || notesVersion) return;
    const offer = notesControlForUpdate({
      published,
      bundledVersion: APP_VERSION,
      bundledNotes: RELEASE_NOTES,
      seen: readStorage(localStorage, NOTES_SEEN_KEY),
    });
    if (!offer) return;
    setNotesLines(offer.notes);
    setNotesVersion(offer.version);
  }, [updateOpen, releaseReady, notesVersion, published]);

  useEffect(() => {
    if (!notesVersion) return;
    writeStorage(localStorage, NOTES_SEEN_KEY, notesVersion);
  }, [notesVersion]);

  useEffect(() => {
    const safari = isSafariUa(navigator.userAgent);
    const stored = readStorage(localStorage, HOME_CHOICE_KEY);
    const legacyHidden = readStorage(localStorage, LEGACY_HIDE_INSTALL_KEY) === "1";
    if (shouldAskForHome({ safari, standalone: standaloneNow(), stored, legacyHidden })) setHomeAsk(true);

    const onPrompt = (event: Event) => {
      const ask = shouldAskForHome({
        safari: isSafariUa(navigator.userAgent),
        standalone: standaloneNow(),
        stored: readStorage(localStorage, HOME_CHOICE_KEY),
        legacyHidden: readStorage(localStorage, LEGACY_HIDE_INSTALL_KEY) === "1",
      });
      if (!ask) return;
      event.preventDefault();
      installPrompt.current = event as InstallPrompt;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    let dropped = false;
    let removeVis: (() => void) | null = null;
    const onController = () => {
      if (readStorage(sessionStorage, UPDATE_ACCEPT_KEY) !== "1") return;
      if (readStorage(sessionStorage, UPDATE_RELOAD_KEY) === "1") return;
      writeStorage(sessionStorage, UPDATE_RELOAD_KEY, "1");
      void snapshotPhone().finally(() => window.location.reload());
    };

    function offer(reg: ServiceWorkerRegistration) {
      const decision = updateDecision({
        hasController: Boolean(navigator.serviceWorker.controller),
        hasActive: Boolean(reg.active),
        hasWaiting: Boolean(reg.waiting),
        accepted: readStorage(sessionStorage, UPDATE_ACCEPT_KEY) === "1",
      });
      if (decision === "finish" && reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      if (decision === "show") {
        registration.current = reg;
        setUpdateOpen(true);
      }
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", onController);
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          if (dropped) return;
          registration.current = reg;
          if (shouldClearUpdateAcceptance({ hasWaiting: Boolean(reg.waiting), hasInstalling: Boolean(reg.installing) })) {
            clearStorage(sessionStorage, UPDATE_ACCEPT_KEY);
            clearStorage(sessionStorage, UPDATE_RELOAD_KEY);
          }
          offer(reg);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed") offer(reg);
            });
          });
          // A shortcut that was fully closed checks again on the next open.
          // Ask here so this launch can see a worker that is ready and waiting.
          void reg
            .update()
            .then(() => {
              if (!dropped) offer(reg);
            })
            .catch(() => undefined);
          const onVis = () => {
            if (document.visibilityState === "visible") void reg.update().catch(() => undefined);
          };
          document.addEventListener("visibilitychange", onVis);
          removeVis = () => document.removeEventListener("visibilitychange", onVis);
        })
        .catch(() => undefined);
    }

    return () => {
      dropped = true;
      removeVis?.();
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onController);
    };
  }, []);

  useEffect(() => {
    if (updateOpen || homeAsk || steps) primary.current?.focus();
  }, [updateOpen, homeAsk, steps]);

  function developUpdate() {
    const waiting = registration.current?.waiting;
    if (!waiting) return;
    writeStorage(sessionStorage, UPDATE_ACCEPT_KEY, "1");
    setDeveloping(true);
    void snapshotPhone().finally(() => waiting.postMessage({ type: "SKIP_WAITING" }));
  }

  function acceptHome() {
    rememberHome("yes");
    setHomeAsk(false);
    const prompt = installPrompt.current;
    installPrompt.current = null;
    if (prompt) {
      void prompt.prompt().catch(() => undefined);
      return;
    }
    const ios = isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    setSteps(ios ? "ios" : "desk");
  }

  function declineHome() {
    rememberHome("no");
    setHomeAsk(false);
  }

  const askVisible = homeAsk && !updateOpen;
  const stepsVisible = steps !== null && !updateOpen;

  return (
    <>
      {updateOpen ? (
        <div className="lab-sheet" role="dialog" aria-modal="true" aria-labelledby="update-title" data-shell="update">
          <div className="sheet-card">
            <p className="kicker">In the lab</p>
            <h2 id="update-title">Santi is in the lab, developing a better camera for you.</h2>
            {notesLines ? (
              <ul id="update-notes" className="sheet-notes" data-release-notes hidden={!notesOpen}>
                {notesLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <button ref={primary} className="primary" type="button" disabled={developing} onClick={developUpdate}>
              Develop the update
            </button>
            {notesLines ? (
              <button
                className="ghost"
                type="button"
                data-release-notes-control
                aria-expanded={notesOpen}
                aria-controls="update-notes"
                onClick={() => setNotesOpen((open) => !open)}
              >
                {notesOpen ? "Hide what's new" : "See what's new"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {askVisible ? (
        <div className="lab-sheet" role="dialog" aria-modal="true" aria-labelledby="home-title" data-shell="home">
          <div className="sheet-card">
            <p className="kicker">Home screen</p>
            <h2 id="home-title">Add Re-Lapse to your home screen?</h2>
            <p className="fine">Keep the camera on the nightstand. One tap, and you&apos;re shooting.</p>
            <button ref={primary} className="primary" type="button" onClick={acceptHome}>
              Yes
            </button>
            <button className="ghost" type="button" onClick={declineHome}>
              No
            </button>
          </div>
        </div>
      ) : null}
      {stepsVisible ? (
        <div className="lab-sheet" role="dialog" aria-modal="true" aria-labelledby="steps-title" data-shell="steps">
          <div className="sheet-card">
            <p className="kicker">Home screen</p>
            <h2 id="steps-title">{steps === "ios" ? "Add it from the share sheet." : "Add it from Safari's Share menu."}</h2>
            <ol className="lab-steps">
              {steps === "ios" ? (
                <>
                  <li><span>01</span><span>Tap <strong>Share</strong></span></li>
                  <li><span>02</span><span>Tap <strong>Add to Home Screen</strong></span></li>
                  <li><span>03</span><span>Tap <strong>Add</strong></span></li>
                </>
              ) : (
                <>
                  <li><span>01</span><span>Open <strong>Share</strong></span></li>
                  <li><span>02</span><span>Choose <strong>Add to Dock</strong></span></li>
                </>
              )}
            </ol>
            <button ref={primary} className="primary" type="button" onClick={() => setSteps(null)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
