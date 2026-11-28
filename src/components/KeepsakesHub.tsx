"use client";

export function KeepsakesHub({
  onGalleries,
  onCapsules,
}: {
  onGalleries: () => void;
  onCapsules: () => void;
}) {
  return (
    <div className="keepsakes-hub" data-screen="keepsakes-hub">
      <button type="button" data-hub="galleries" onClick={onGalleries}>
        <span className="keepsakes-hub-mark" aria-hidden="true">
          🖼️
        </span>
        <span className="keepsakes-hub-name">Galleries</span>
      </button>
      <button type="button" data-hub="capsules" onClick={onCapsules}>
        <span className="keepsakes-hub-mark" aria-hidden="true">
          ⏳
        </span>
        <span className="keepsakes-hub-name">Time Capsules</span>
      </button>
    </div>
  );
}
