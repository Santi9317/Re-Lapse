"use client";

import { useState } from "react";
import { FEATURE_WALK } from "@/lib/walkthrough";

/** A sample frame for this visit. Closing the walk throws the sample away. */
export function FeatureWalk({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [back, setBack] = useState(false);
  const step = FEATURE_WALK[index] ?? FEATURE_WALK[0];
  const last = index >= FEATURE_WALK.length - 1;
  const showBack = back || step.id === "notes";

  function next() {
    if (last) {
      onDone();
      return;
    }
    setIndex((current) => current + 1);
  }

  return (
    <div className="feature-walk" data-feature-walk data-step={step.id} role="dialog" aria-modal="true" aria-label="Feature walkthrough">
      <p className="kicker">{step.kicker}</p>
      <h2>{step.title}</h2>
      <button
        type="button"
        className="feature-walk-frame"
        data-sample-photo
        data-sample-back={showBack ? "true" : "false"}
        aria-label={showBack ? "Sample note on the back" : "Sample photo. Tap to turn it over."}
        onClick={() => setBack((open) => !open)}
      >
        {showBack ? (
          <p className="frame-note-text" data-hand="caveat">
            The roof was still warm.
          </p>
        ) : (
          <img src="/recap/roof.png" alt="" draggable={false} />
        )}
      </button>
      <p>{step.line}</p>
      <button className="primary" type="button" data-feature-walk-next onClick={next}>
        {last ? "Done" : "Next"}
      </button>
    </div>
  );
}
