"use client";

import { useEffect, useRef, useState } from "react";
import {
  HOME_CHOICE_KEY,
  ICON_PROMPT_PENDING_KEY,
  ICON_SEEN_KEY,
  LEGACY_HIDE_INSTALL_KEY,
  NOTES_SEEN_KEY,
  UPDATE_ACCEPT_KEY,
  UPDATE_RELOAD_KEY,
  clearStorage,
  homeInstructions,
  isIosDevice,
  isSafariUa,
  isStandaloneDisplay,
  readStorage,
  shouldAskForHome,
  shouldClearUpdateAcceptance,
  shouldOpenInstallInstructions,
  updateDecision,
  writeStorage,
} from "@/lib/shell";
import {
  RELEASE_NOTES,
  notesControlForUpdate,
  notesPromptOnEntry,
  publishedReleaseFromJson,
  type PublishedRelease,
} from "@/lib/release-notes";
import { APP_VERSION } from "@/lib/release";
import {
  ICON_PROMPT_DISMISS,
  ICON_PROMPT_KICKER,
  ICON_PROMPT_STEPS,
  ICON_PROMPT_TITLE,
  bundledIconRelease,
  iconPromptPlan,
  iconReleaseFromJson,
  type IconRelease,
} from "@/lib/icon-prompt";
import { snapshotPhone } from "@/lib/identity";

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
  const [iconRelease, setIconRelease] = useState<IconRelease | null>(null);
  const [updateSettled, setUpdateSettled] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [notesOffer, setNotesOffer] = useState<PublishedRelease | null | undefined>(undefined);
  const [notesDismissed, setNotesDismissed] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const sawWaitingUpdate = useRef(false);
  const justUpdated = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    let dropped = false;
    void fetch("/release.json", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (dropped) return;
        setPublished(publishedReleaseFromJson(body));
        setIconRelease(iconReleaseFromJson(body));
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
    if (!releaseReady) return;
    setNotesOffer((current) => {
      if (current !== undefined) return current;
      return notesControlForUpdate({
        published,
        bundledVersion: APP_VERSION,
        bundledNotes: RELEASE_NOTES,
        seen: readStorage(localStorage, NOTES_SEEN_KEY),
      });
    });
  }, [releaseReady, published]);

  useEffect(() => {
    justUpdated.current = readStorage(sessionStorage, UPDATE_RELOAD_KEY) === "1";
    const homeChoice = () => ({
      safari: isSafariUa(navigator.userAgent),
      standalone: standaloneNow(),
      stored: readStorage(localStorage, HOME_CHOICE_KEY),
      legacyHidden: readStorage(localStorage, LEGACY_HIDE_INSTALL_KEY) === "1",
    });
    const openInstructions = () => {
      setSteps(homeInstructions(isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)));
    };
    const home = homeChoice();
    if (shouldAskForHome(home)) setHomeAsk(true);
    else if (shouldOpenInstallInstructions(home)) openInstructions();

    const onPrompt = (event: Event) => {
      const next = homeChoice();
      // Hold the browser's own install bar. The instructions are the nudge.
      if (!shouldAskForHome(next) && !shouldOpenInstallInstructions(next)) return;
      event.preventDefault();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    let dropped = false;
    let removeVis: (() => void) | null = null;
    // Notes on entry should not wait forever for a worker check that never settles.
    const settleTimer = window.setTimeout(() => {
      if (!dropped) setUpdateSettled(true);
    }, 4000);
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
      if (decision === "show" || decision === "finish") sawWaitingUpdate.current = true;
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
              if (dropped) return;
              offer(reg);
              setUpdateSettled(true);
            })
            .catch(() => {
              if (!dropped) setUpdateSettled(true);
            });
          const onVis = () => {
            if (document.visibilityState === "visible") void reg.update().catch(() => undefined);
          };
          document.addEventListener("visibilitychange", onVis);
          removeVis = () => document.removeEventListener("visibilitychange", onVis);
        })
        .catch(() => {
          if (!dropped) setUpdateSettled(true);
        });
    } else {
      setUpdateSettled(true);
    }

    return () => {
      dropped = true;
      window.clearTimeout(settleTimer);
      removeVis?.();
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onController);
    };
  }, []);

  const notesVisible =
    !notesDismissed &&
    notesPromptOnEntry({
      offer: notesOffer ?? null,
      updateOpen,
      updateSettled,
      blocked: homeAsk || steps !== null,
    });

  useEffect(() => {
    if (!notesOffer) return;
    if (!notesVisible && !updateOpen) return;
    writeStorage(localStorage, NOTES_SEEN_KEY, notesOffer.version);
  }, [notesOffer, notesVisible, updateOpen]);

  useEffect(() => {
    if (!updateSettled || !releaseReady) return;
    const release = iconRelease ?? bundledIconRelease(APP_VERSION);
    const seen = readStorage(localStorage, ICON_SEEN_KEY);
    const pending = readStorage(localStorage, ICON_PROMPT_PENDING_KEY);
    const plan = iconPromptPlan({
      release,
      seen,
      pending,
      updateWaiting: sawWaitingUpdate.current,
      justUpdated: justUpdated.current,
      blocked: updateOpen || homeAsk || steps !== null || notesVisible || notesOffer === undefined,
    });
    if (plan.pending !== pending) {
      if (plan.pending) writeStorage(localStorage, ICON_PROMPT_PENDING_KEY, plan.pending);
      else clearStorage(localStorage, ICON_PROMPT_PENDING_KEY);
    }
    if (!plan.show) return;
    setIconOpen(true);
    const markSeen = window.setTimeout(() => {
      writeStorage(localStorage, ICON_SEEN_KEY, release.version);
      clearStorage(localStorage, ICON_PROMPT_PENDING_KEY);
    }, 0);
    return () => window.clearTimeout(markSeen);
  }, [updateSettled, releaseReady, iconRelease, updateOpen, homeAsk, steps, notesOffer, notesVisible]);

  useEffect(() => {
    if (updateOpen || notesVisible || homeAsk || steps || iconOpen) primary.current?.focus();
  }, [updateOpen, notesVisible, homeAsk, steps, iconOpen]);

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
    setSteps(homeInstructions(isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)));
  }

  function dismissSteps() {
    rememberHome("yes");
    setSteps(null);
  }

  function declineHome() {
    rememberHome("no");
    setHomeAsk(false);
  }

  const askVisible = homeAsk && !updateOpen;
  const stepsVisible = steps !== null && !updateOpen;
  const iconVisible = iconOpen && !updateOpen && !notesVisible && !homeAsk && steps === null;

  return (
    <>
      {updateOpen ? (
        <div className="lab-sheet" role="dialog" aria-modal="true" aria-labelledby="update-title" data-shell="update">
          <div className="sheet-card">
            <p className="kicker">In the lab</p>
            <h2 id="update-title">Santi is in the lab, developing a better camera for you.</h2>
            {notesOffer ? (
              <ul id="update-notes" className="sheet-notes" data-release-notes hidden={!notesOpen}>
                {notesOffer.notes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <button ref={primary} className="primary" type="button" disabled={developing} onClick={developUpdate}>
              Develop the update
            </button>
            {notesOffer ? (
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
      {notesVisible && notesOffer ? (
        <div className="lab-sheet" role="dialog" aria-modal="true" aria-labelledby="notes-title" data-shell="notes">
          <div className="sheet-card">
            <p className="kicker">What's new</p>
            <h2 id="notes-title">A better camera is ready.</h2>
            <ul id="entry-notes" className="sheet-notes" data-release-notes hidden={!notesOpen}>
              {notesOffer.notes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button
              ref={primary}
              className="primary"
              type="button"
              data-release-notes-control
              aria-expanded={notesOpen}
              aria-controls="entry-notes"
              onClick={() => setNotesOpen((open) => !open)}
            >
              {notesOpen ? "Hide what's new" : "See what's new"}
            </button>
            <button className="ghost" type="button" onClick={() => setNotesDismissed(true)}>
              Got it
            </button>
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
            <button ref={primary} className="primary" type="button" onClick={dismissSteps}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
      {iconVisible ? (
        <div className="lab-sheet" role="dialog" aria-modal="true" aria-labelledby="icon-title" data-shell="icon">
          <div className="sheet-card">
            <p className="kicker">{ICON_PROMPT_KICKER}</p>
            <h2 id="icon-title">{ICON_PROMPT_TITLE}</h2>
            <ol className="lab-steps" id="icon-steps">
              {ICON_PROMPT_STEPS.map((step, index) => (
                <li key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <button ref={primary} className="primary" type="button" onClick={() => setIconOpen(false)}>
              {ICON_PROMPT_DISMISS}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
