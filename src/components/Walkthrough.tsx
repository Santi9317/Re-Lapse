"use client";

import { useEffect, useState } from "react";
import { readStorage, writeStorage } from "@/lib/shell";
import {
  WALK_AGAIN,
  WALK_KEY,
  WALK_TIPS,
  commitWalk,
  freshWalkBook,
  readWalkBook,
  walkMarkVisible,
  walkVisible,
  writeWalkBook,
  type WalkAction,
  type WalkBook,
  type WalkId,
} from "@/lib/walkthrough";

export function useWalk(id: WalkId, placeOpen: boolean) {
  const [book, setBook] = useState<WalkBook>(freshWalkBook);
  const [held, setHeld] = useState(false);
  const [asked, setAsked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setBook(readWalkBook(readStorage(localStorage, WALK_KEY)));
    setReady(true);
  }, [id]);

  const status = book[id];
  const visible = ready && walkVisible({ status, placeOpen, held, asked });
  const mark = ready && walkMarkVisible({ status, placeOpen, tipOpen: visible });

  function commit(action: WalkAction) {
    const next = commitWalk(readStorage(localStorage, WALK_KEY), id, action);
    setBook(next);
    writeStorage(localStorage, WALK_KEY, writeWalkBook(next));
    setAsked(false);
    setHeld(action === "later");
  }

  return {
    visible,
    mark,
    dismiss: () => commit("dismiss"),
    skip: () => commit("skip"),
    later: () => commit("later"),
    revisit: () => {
      setHeld(false);
      setAsked(true);
    },
  };
}

export function WalkTip({
  id,
  onDismiss,
  onSkip,
  onLater,
}: {
  id: WalkId;
  onDismiss: () => void;
  onSkip: () => void;
  onLater: () => void;
}) {
  const tip = WALK_TIPS.find((item) => item.id === id);
  if (!tip) return null;
  return (
    <aside className="walk-tip" data-walk={id} aria-label={tip.kicker}>
      <p className="kicker">{tip.kicker}</p>
      <p>{tip.line}</p>
      <div className="walk-actions">
        <button type="button" data-walk-dismiss={id} onClick={onDismiss}>
          Got it
        </button>
        <button type="button" data-walk-skip={id} onClick={onSkip}>
          Skip
        </button>
        <button type="button" data-walk-later={id} onClick={onLater}>
          Later
        </button>
      </div>
    </aside>
  );
}

export function WalkMark({ id, onOpen }: { id: WalkId; onOpen: () => void }) {
  return (
    <button type="button" className="walk-mark" data-walk-again={id} onClick={onOpen}>
      {WALK_AGAIN[id]}
    </button>
  );
}
