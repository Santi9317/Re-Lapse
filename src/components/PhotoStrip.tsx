"use client";

import { useState, type ReactNode } from "react";

/** A sideways row of photos. The row stays one card tall so actions under it stay on the page. */
export function PhotoStrip({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="photo-strip" data-photo-strip={name} role="list" aria-label={label}>
      {children}
    </div>
  );
}

export function StripShot({ id, label, onOpen }: { id: string; label: string; onOpen: () => void }) {
  const [dead, setDead] = useState(false);
  return (
    <button type="button" className="photo-strip-shot" aria-label={label} onClick={onOpen}>
      {dead ? (
        <span className="photo-strip-missing">Left the lab</span>
      ) : (
        <img src={`/api/photos/${id}/image`} alt="" draggable={false} onError={() => setDead(true)} />
      )}
    </button>
  );
}
