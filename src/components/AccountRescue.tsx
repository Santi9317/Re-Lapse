"use client";

import { useEffect, useRef, useState } from "react";
import { fetchRescue, requestRecovery, type GateStatus } from "@/lib/api";

type Phase = "form" | "pending" | "declined" | "replacing";

export function AccountRescue() {
  const [phase, setPhase] = useState<Phase>("form");
  const [profileName, setProfileName] = useState("");
  const [pin, setPin] = useState("");
  const [kept, setKept] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const replaced = useRef(false);
  const looking = useRef(false);

  useEffect(() => {
    if (phase !== "pending") return;
    let stop = false;
    async function look() {
      if (looking.current || replaced.current) return;
      looking.current = true;
      try {
        const gate = await fetchRescue({ replaceDevice: true });
        if (stop || !gate) return;
        setKept(gate.name);
        if (gate.status === "accepted") {
          bringBack();
          return;
        }
        if (gate.status === "declined") setPhase("declined");
      } catch (err: unknown) {
        if (stop) return;
        setError(err instanceof Error ? err.message : "The lab didn't answer.");
      } finally {
        looking.current = false;
      }
    }
    void look();
    const id = window.setInterval(() => void look(), 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [phase]);

  function bringBack() {
    if (replaced.current) return;
    replaced.current = true;
    setPhase("replacing");
    window.location.reload();
  }

  async function settle(status: GateStatus, name: string) {
    setKept(name);
    if (status === "accepted") {
      const settled = await fetchRescue({ replaceDevice: true });
      if (settled?.status === "accepted") {
        bringBack();
        return;
      }
      if (settled?.status === "declined") {
        setPhase("declined");
        return;
      }
    }
    setPhase(status === "declined" ? "declined" : "pending");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = profileName.trim();
    if (!trimmed) {
      setError("Enter the profile name.");
      return;
    }
    if (pin.length !== 6) {
      setError("Enter the 6-digit PIN.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const gate = await requestRecovery(trimmed, pin);
      setPin("");
      await settle(gate.status, gate.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "That name and PIN don't match a profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sleeve-copy" data-pin-entry="menu" data-rescue={phase}>
      <h2 className="section">Recover an account</h2>
      <p id="menu-pin-help">
        Enter that profile&apos;s name and PIN. Santiago approves the request before it replaces the profile on this
        phone. The same digits can belong to another name.
      </p>
      {phase === "pending" ? (
        <div className="empty">
          <h2>Waiting</h2>
          <p>
            {kept ? `${kept} is waiting on Santiago.` : "Santiago hasn't approved this yet."} This menu checks on its
            own.
          </p>
        </div>
      ) : null}
      {phase === "declined" ? (
        <div className="empty">
          <h2>Not this time</h2>
          <p>{kept ? `${kept} stays where it was.` : "That profile stays where it was."}</p>
        </div>
      ) : null}
      {phase === "replacing" ? (
        <div className="empty">
          <h2>Bringing it back</h2>
          <p>Replacing the profile on this phone.</p>
        </div>
      ) : null}
      {phase === "form" ? (
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label className="section" htmlFor="menu-profile-name">
            Profile name
          </label>
          <input
            id="menu-profile-name"
            className="field"
            name="profile-name"
            autoComplete="nickname"
            maxLength={24}
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="The name on the profile"
          />
          <label className="section" htmlFor="menu-pin">
            6-digit PIN
          </label>
          <input
            id="menu-pin"
            className="field pin-field"
            name="pin"
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            aria-describedby="menu-pin-help"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
          />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary" type="submit" disabled={busy || pin.length !== 6 || profileName.trim().length === 0}>
            {busy ? "Asking…" : "Ask to bring it back"}
          </button>
        </form>
      ) : null}
      {phase !== "form" && error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
