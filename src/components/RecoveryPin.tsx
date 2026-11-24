"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchRecoveryPin, saveRecoveryPin } from "@/lib/api";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function groupedPin(pin: string): string {
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

export function RecoveryPinFields({
  mode,
  onSaved,
}: {
  mode: "choose" | "change";
  onSaved: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changing = mode === "change";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pin.length !== 6 || again.length !== 6) {
      setError("Enter a 6-digit PIN.");
      return;
    }
    if (pin !== again) {
      setError("Type the same six digits again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveRecoveryPin(pin);
      setPin("");
      setAgain("");
      onSaved(pin);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The lab didn't answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" data-recovery-mode={mode} onSubmit={(event) => void submit(event)}>
      <label className="section" htmlFor={changing ? "recovery-new" : "recovery-choose"}>
        {changing ? "New PIN" : "Recovery PIN"}
      </label>
      <input
        id={changing ? "recovery-new" : "recovery-choose"}
        className="field pin-field"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={6}
        value={pin}
        onChange={(event) => setPin(digitsOnly(event.target.value))}
        placeholder="000000"
      />
      <label className="section" htmlFor={changing ? "recovery-new-again" : "recovery-choose-again"}>
        Type it again
      </label>
      <input
        id={changing ? "recovery-new-again" : "recovery-choose-again"}
        className="field pin-field"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={6}
        value={again}
        onChange={(event) => setAgain(digitsOnly(event.target.value))}
        placeholder="000000"
      />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary" type="submit" disabled={busy || pin.length !== 6 || again.length !== 6}>
        {busy ? "Saving…" : changing ? "Change PIN" : "Save PIN"}
      </button>
    </form>
  );
}

export function RecoveryPinPanel({
  saved,
  pin,
  onPin,
}: {
  saved: boolean;
  pin: string | null;
  onPin: (pin: string) => void;
}) {
  const chosen = saved || Boolean(pin);
  return (
    <div className="sleeve-copy" data-recovery-panel={chosen ? "change" : "choose"}>
      <h2 className="section">{chosen ? "Your recovery PIN" : "Set a recovery PIN"}</h2>
      {pin ? (
        <>
          <p className="pin-digits" data-recovery-pin={pin} aria-label={`Recovery PIN ${pin.split("").join(" ")}`}>
            {groupedPin(pin)}
          </p>
          <p>Write it down with this profile&apos;s name. This menu will not show the digits again. A new phone asks Santiago before the profile comes back.</p>
        </>
      ) : chosen ? (
        <p>A PIN is set for this profile. It is not shown again. A new one replaces it.</p>
      ) : (
        <p>You don't have one yet. Pick six digits and keep them with this profile&apos;s name. The same digits can belong to another name.</p>
      )}
      <RecoveryPinFields mode={chosen ? "change" : "choose"} onSaved={onPin} />
    </div>
  );
}

/** Shown once access is granted, until this camera has a recovery PIN. */
export function ChoosePin({ onReady }: { onReady: () => void }) {
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const [phase, setPhase] = useState<"checking" | "choose" | "error">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    void fetchRecoveryPin()
      .then((set) => {
        if (stop) return;
        if (set) readyRef.current();
        else setPhase("choose");
      })
      .catch((err: unknown) => {
        if (stop) return;
        setError(err instanceof Error ? err.message : "The lab didn't answer.");
        setPhase("error");
      });
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div className="desk">
      <div className="phone">
        <header className="top">
          <h1 className="word">Re-Lapse ✨</h1>
          <p className="lede">You're in. Choose the PIN that brings this profile back.</p>
        </header>
        <div className="stage">
          <div className="scroll" data-choose-pin={phase}>
            {phase === "checking" ? <p className="fine">Checking the recovery PIN.</p> : null}
            {phase === "error" ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            {phase === "choose" ? (
              <>
                <p className="kicker">You're in</p>
                <h2 className="section">Choose a recovery PIN</h2>
                <p className="fine">
                  Pick six digits and keep them with this profile&apos;s name. This menu will not show the digits again. A new
                  phone asks Santiago before the profile comes back. The same digits can belong to another name.
                </p>
                <RecoveryPinFields
                  mode="choose"
                  onSaved={() => {
                    readyRef.current();
                  }}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
