"use client";

import { useEffect, useRef } from "react";
import type { Quote } from "@/lib/quotes";

export function QuoteDialog({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef(onClose);
  dismissRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="lab-sheet banner-quote"
      role="dialog"
      aria-modal="true"
      aria-labelledby="banner-quote-title"
      data-banner-quote={quote.id}
      onClick={() => dismissRef.current()}
    >
      <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
        <p className="kicker" id="banner-quote-title">Inspiration</p>
        <figure className="quote-card" data-quote-id={quote.id}>
          <blockquote>
            <p>{quote.text}</p>
          </blockquote>
          <figcaption>
            {quote.emoji} {quote.author}
          </figcaption>
        </figure>
        <button ref={closeRef} className="primary" type="button" onClick={() => dismissRef.current()}>
          Close
        </button>
      </div>
    </div>
  );
}
