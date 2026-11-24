"use client";

import { useEffect, useRef, useState } from "react";

export function PinSlip() {
  const [pin, setPin] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onPin = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "string" && /^\d{6}$/.test(detail)) setPin(detail);
    };
    window.addEventListener("relapse-pin", onPin);
    return () => window.removeEventListener("relapse-pin", onPin);
  }, []);

  useEffect(() => {
    if (pin) button.current?.focus();
  }, [pin]);

  if (!pin) return null;
  const shown = `${pin.slice(0, 3)} ${pin.slice(3)}`;
  return (
    <div className="lab-sheet pin-slip" role="dialog" aria-modal="true" aria-labelledby="pin-title" data-pin-slip="open">
      <div className="sheet-card">
        <p className="kicker">Write this down</p>
        <h2 id="pin-title">This PIN brings your profile back.</h2>
        <p className="pin-digits" aria-label={`PIN ${pin.split("").join(" ")}`}>
          {shown}
        </p>
        <p className="fine">
          It works after you leave this page, and after this phone forgets you. We won&apos;t show it again.
        </p>
        <button ref={button} className="primary" type="button" onClick={() => setPin(null)}>
          I wrote it down
        </button>
      </div>
    </div>
  );
}
