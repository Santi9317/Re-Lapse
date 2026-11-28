"use client";

import { useEffect, useState } from "react";
import { FEATURE_WALK, type FeatureWalkStep } from "@/lib/walkthrough";

/** A sample frame for this visit. Closing the walk throws the sample away. */
export function FeatureWalk({
  onDone,
  onStep,
}: {
  onDone: () => void;
  onStep?: (id: FeatureWalkStep["id"]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [back, setBack] = useState(false);
  const [opened, setOpened] = useState(false);
  const step = FEATURE_WALK[index] ?? FEATURE_WALK[0];
  const last = index >= FEATURE_WALK.length - 1;
  const showSample = step.id !== "feed";
  const showBack = step.id === "signatures" && back;

  useEffect(() => {
    onStep?.(step.id);
  }, [onStep, step.id]);

  useEffect(() => {
    setBack(false);
    setOpened(false);
  }, [step.id]);

  function next() {
    if (last) {
      onDone();
      return;
    }
    setIndex((current) => current + 1);
  }

  function flipSample() {
    setBack((open) => !open);
    setOpened(true);
  }

  return (
    <div className="feature-walk" data-feature-walk data-step={step.id} role="dialog" aria-modal="true" aria-label="Feature walkthrough">
      <p className="kicker">{step.kicker}</p>
      <h2>{step.title}</h2>
      {showSample && step.id === "emoji" ? (
        <div className="feature-walk-frame" data-sample-photo data-sample-back="false" data-sample-emoji="true">
          <img src="/recap/roof.png" alt="" draggable={false} />
          <span className="feature-walk-emoji" data-unseen="true" aria-hidden="true">
            ✨
          </span>
        </div>
      ) : null}
      {showSample && step.id === "signatures" ? (
        <button
          type="button"
          className="feature-walk-frame"
          data-sample-photo
          data-sample-back={showBack ? "true" : "false"}
          data-sample-unread={opened ? "false" : "true"}
          aria-label={showBack ? "Sample signature on the back" : "Sample photo. Tap once to flip it and write on the back."}
          onClick={flipSample}
        >
          {showBack ? (
            <p className="frame-note-text" data-hand="caveat">
              The roof was still warm.
            </p>
          ) : (
            <img src="/recap/roof.png" alt="" draggable={false} />
          )}
        </button>
      ) : null}
      <p>{step.line}</p>
      <button className="primary" type="button" data-feature-walk-next onClick={next}>
        {last ? "Done" : "Next"}
      </button>
    </div>
  );
}
