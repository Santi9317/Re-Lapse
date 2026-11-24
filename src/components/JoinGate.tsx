"use client";

import { useEffect, useRef, useState } from "react";
import { fetchGate, requestToJoin, restoreWithPin } from "@/lib/api";

type Phase = "checking" | "ask" | "pending" | "declined";

export function JoinGate({ onOpen }: { onOpen: () => void }) {
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const [phase, setPhase] = useState<Phase>("checking");
  const [name, setName] = useState("");
  const [kept, setKept] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    async function look() {
      try {
        const gate = await fetchGate();
        if (stop) return;
        if (!gate) {
          setPhase((current) => (current === "ask" || current === "pending" || current === "declined" ? current : "ask"));
          return;
        }
        setKept(gate.name);
        if (gate.status === "accepted") {
          openRef.current();
          return;
        }
        setPhase(gate.status);
      } catch (err: unknown) {
        if (stop) return;
        setError(err instanceof Error ? err.message : "The lab didn't answer.");
        setPhase((current) => (current === "checking" ? "ask" : current));
      }
    }
    void look();
    const id = window.setInterval(() => void look(), 3000);
    const onVis = () => {
      if (document.visibilityState === "visible") void look();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give it a short name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const gate = await requestToJoin(trimmed);
      setKept(gate.name);
      if (gate.status === "accepted") {
        openRef.current();
        return;
      }
      setPhase(gate.status);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The lab didn't answer.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(event: React.FormEvent) {
    event.preventDefault();
    if (pin.length !== 6) {
      setPinError("Enter the 6-digit PIN.");
      return;
    }
    setPinBusy(true);
    setPinError("");
    try {
      const gate = await restoreWithPin(pin);
      setPin("");
      setKept(gate.name);
      if (gate.status === "accepted") {
        openRef.current();
        return;
      }
      setPhase(gate.status);
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : "That PIN doesn't match a profile.");
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="desk">
      <div className="phone">
        <header className="top">
          <h1 className="word">Re-Lapse ✨</h1>
          <p className="lede">
            {phase === "pending"
              ? "Santiago hasn't opened the gate yet. This page checks on its own."
              : phase === "declined"
                ? "This camera stays outside."
                : "Ask to join. A name is enough. The camera stays shut until Santiago says yes."}
          </p>
        </header>
        <div className="stage">
          <div className="scroll">
            {phase === "checking" ? <p className="fine">Checking the gate.</p> : null}
            {phase === "ask" ? (
              <form className="stack" onSubmit={(event) => void submit(event)}>
                <label className="section" htmlFor="gate-name">
                  Your name
                </label>
                <input
                  id="gate-name"
                  className="field"
                  name="name"
                  autoComplete="name"
                  maxLength={40}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="What should he call you?"
                />
                {error ? (
                  <p className="error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Asking…" : "Request to join"}
                </button>
              </form>
            ) : null}
            {phase === "pending" ? (
              <div className="empty">
                <h2>Waiting</h2>
                <p>
                  {kept ? `${kept} is in line.` : "You're in line."} Leave and come back. This request stays put.
                </p>
              </div>
            ) : null}
            {phase === "declined" ? (
              <div className="empty">
                <h2>Not this time</h2>
                <p>{kept ? `${kept} stays outside.` : "This camera stays outside."} A refresh keeps it that way.</p>
              </div>
            ) : null}
            {phase !== "checking" ? (
              <form className="stack pin-form" data-pin-entry="gate" onSubmit={(event) => void submitPin(event)}>
                <p className="gate-or">Already have a profile</p>
                <label className="section" htmlFor="gate-pin">
                  6-digit PIN
                </label>
                <p className="fine" id="gate-pin-help">
                  The PIN from when the profile was made. It brings that profile back onto this phone.
                </p>
                <input
                  id="gate-pin"
                  className="field pin-field"
                  name="pin"
                  inputMode="numeric"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={6}
                  aria-describedby="gate-pin-help"
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                />
                {pinError ? (
                  <p className="error" role="alert">
                    {pinError}
                  </p>
                ) : null}
                <button className="primary" type="submit" disabled={pinBusy || pin.length !== 6}>
                  {pinBusy ? "Checking…" : "Bring my profile back"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
