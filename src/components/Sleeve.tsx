"use client";

import { useEffect, useRef, useState } from "react";
import { HOW_TO } from "@/lib/howto";
import { pickQuote, type Quote } from "@/lib/quotes";
import { loadRelease, type Release } from "@/lib/release";

const LAST_KEY = "relapse.inspiration";

type Panel = "menu" | "version" | "howto" | "inspiration";

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
  const backRef = useRef<HTMLButtonElement>(null);
  const markRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const release: Release | null = panel === "version" ? loadRelease() : null;

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

  if (!panel) {
    return (
      <button ref={markRef} className="sleeve-mark" type="button" data-profile-menu aria-label="Profile menu" onClick={() => setPanel("menu")}>
        Menu
      </button>
    );
  }

  const title =
    panel === "menu" ? "Menu" : panel === "version" ? "Version tracker" : panel === "howto" ? "How To" : "Inspiration";

  return (
    <div className="sleeve" role="dialog" aria-modal="true" aria-label={title} data-sleeve-panel={panel}>
      <button ref={backRef} className="ghost back" type="button" onClick={() => setPanel(panel === "menu" ? null : "menu")}>
        {panel === "menu" ? "← Profile" : "← Menu"}
      </button>
      {panel === "menu" ? (
        <div className="sleeve-list">
          <button type="button" data-sleeve-item="version" onClick={() => setPanel("version")}>
            <strong>Version tracker</strong>
            <span>The camera in your hands, and the day it shipped.</span>
          </button>
          <button type="button" data-sleeve-item="howto" onClick={() => setPanel("howto")}>
            <strong>How To</strong>
            <span>Every trick currently on this roll.</span>
          </button>
          <button type="button" data-sleeve-item="inspiration" onClick={() => setPanel("inspiration")}>
            <strong>Inspiration</strong>
            <span>A line for the next time you need one.</span>
          </button>
        </div>
      ) : null}
      {panel === "version" ? (
        <div className="sleeve-copy" data-version-tracker>
          <h2 className="section">Version tracker</h2>
          {release ? (
            <>
              <p className="release-version" data-release-version={release.version} data-release-sha={release.sha}>
                {release.version} · {release.short}
              </p>
              <p className="release-date" data-release-iso={release.iso}>
                {release.date}
              </p>
              <p>The commit in this camera, and the day it shipped.</p>
            </>
          ) : (
            <p className="error">This camera could not read the commit it shipped with.</p>
          )}
        </div>
      ) : null}
      {panel === "howto" ? (
        <article className="sleeve-copy" data-howto>
          <h2 className="section">How To</h2>
          <p>The disposable, with the waiting left in.</p>
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
