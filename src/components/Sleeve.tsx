"use client";

import { useEffect, useRef, useState } from "react";
import { fetchRecoveryPin } from "@/lib/api";
import { HOW_TO } from "@/lib/howto";
import { pickQuote, type Quote } from "@/lib/quotes";
import { APP_VERSION } from "@/lib/release";
import { AccountRescue } from "@/components/AccountRescue";
import { groupedPin, RecoveryPinPanel } from "@/components/RecoveryPin";

const LAST_KEY = "relapse.inspiration";

type Panel = "menu" | "version" | "howto" | "inspiration" | "recovery" | "account";

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function writeLast(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* the next open can repeat if this device refuses storage */
  }
}

export function Sleeve() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [recoverySet, setRecoverySet] = useState(false);
  const [recoveryPin, setRecoveryPin] = useState<string | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const markRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (panel) {
      opened.current = true;
      backRef.current?.focus();
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") setPanel(null);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    if (opened.current) markRef.current?.focus();
  }, [panel]);

  useEffect(() => {
    if (panel !== "inspiration") return;
    const next = pickQuote(readLast());
    writeLast(next.id);
    setQuote(next);
  }, [panel]);

  useEffect(() => {
    if (!panel) {
      setRecoveryPin(null);
      setRecoverySet(false);
      return;
    }
    let stop = false;
    void fetchRecoveryPin()
      .then((set) => {
        if (!stop) setRecoverySet(set);
      })
      .catch(() => {
        if (!stop) setRecoverySet(false);
      });
    return () => {
      stop = true;
    };
  }, [panel]);

  if (!panel) {
    return (
      <button ref={markRef} className="sleeve-mark" type="button" data-profile-menu aria-label="Profile menu" onClick={() => setPanel("menu")}>
        Menu
      </button>
    );
  }

  const title =
    panel === "menu"
      ? "Menu"
      : panel === "version"
        ? "Version tracker"
        : panel === "howto"
          ? "How To"
          : panel === "recovery"
            ? "Recovery PIN"
            : panel === "account"
              ? "Recover an account"
              : "Inspiration";

  return (
    <div className="sleeve" role="dialog" aria-modal="true" aria-label={title} data-sleeve-panel={panel}>
      <button ref={backRef} className="ghost back" type="button" onClick={() => setPanel(panel === "menu" ? null : "menu")}>
        {panel === "menu" ? "← Profile" : "← Menu"}
      </button>
      {panel === "menu" ? (
        <div className="sleeve-list">
          <button type="button" data-sleeve-item="version" onClick={() => setPanel("version")}>
            <strong>Version tracker</strong>
            <span>{APP_VERSION}</span>
          </button>
          <button type="button" data-sleeve-item="howto" onClick={() => setPanel("howto")}>
            <strong>How To</strong>
            <span>A short tour of the camera.</span>
          </button>
          <button type="button" data-sleeve-item="inspiration" onClick={() => setPanel("inspiration")}>
            <strong>Inspiration</strong>
            <span>A line for the next time you need one.</span>
          </button>
          <button type="button" data-sleeve-item="recovery" onClick={() => setPanel("recovery")}>
            <strong>{recoverySet || recoveryPin ? "Change recovery PIN" : "Set a recovery PIN"}</strong>
            <span className={recoveryPin ? "recovery-menu-pin" : undefined}>
              {recoveryPin ? groupedPin(recoveryPin) : recoverySet ? "A PIN is set." : "You don't have one yet."}
            </span>
          </button>
          <button type="button" data-sleeve-item="account" onClick={() => setPanel("account")}>
            <strong>Recover an account</strong>
            <span>Name and PIN. It replaces the profile on this phone.</span>
          </button>
        </div>
      ) : null}
      {panel === "version" ? (
        <div className="sleeve-copy" data-version-tracker>
          <h2 className="section">Version tracker</h2>
          <p className="release-version" data-release-version={APP_VERSION}>
            {APP_VERSION}
          </p>
          <p>The camera in your hands.</p>
        </div>
      ) : null}
      {panel === "howto" ? (
        <article className="sleeve-copy" data-howto>
          <h2 className="section">How To</h2>
          <p>From the icon on your home screen.</p>
          {HOW_TO.map((section) => (
            <section key={section.id} data-howto-section={section.id}>
              <h3>{section.title}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </article>
      ) : null}
      {panel === "recovery" ? (
        <RecoveryPinPanel
          saved={recoverySet}
          pin={recoveryPin}
          onPin={(pin) => {
            setRecoveryPin(pin);
            setRecoverySet(true);
          }}
        />
      ) : null}
      {panel === "account" ? <AccountRescue /> : null}
      {panel === "inspiration" ? (
        <div className="sleeve-copy" data-inspiration>
          <h2 className="section">Inspiration</h2>
          <p>One line from the sleeve. It tries not to tell you the same thing twice in a row.</p>
          {quote ? (
            <figure className="quote-card" data-quote-id={quote.id}>
              <blockquote>
                <p>{quote.text}</p>
              </blockquote>
              <figcaption>
                {quote.emoji} {quote.author}
              </figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
