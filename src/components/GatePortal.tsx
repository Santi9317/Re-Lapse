"use client";

import { useCallback, useEffect, useState } from "react";

type Pending = { id: string; name: string; createdAt: number };
type Phase = "checking" | "locked" | "open" | "down";

function when(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function GatePortal() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [key, setKey] = useState("");
  const [requests, setRequests] = useState<Pending[]>([]);
  const [recoveries, setRecoveries] = useState<Pending[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/gate/admin/requests", {
      headers: { "x-relapse-gate": "1" },
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as {
      requests?: Pending[];
      recoveries?: Pending[];
      error?: string;
    } | null;
    if (response.status === 503) {
      setPhase("down");
      setError(data?.error || "The gate isn't set up on this server.");
      return;
    }
    if (response.status === 401) {
      setPhase("locked");
      setRequests([]);
      setRecoveries([]);
      return;
    }
    if (!response.ok || !data?.requests) {
      setError(data?.error || "The lab didn't answer.");
      return;
    }
    setPhase("open");
    setError("");
    setRequests(data.requests);
    setRecoveries(data.recoveries ?? []);
  }, []);

  useEffect(() => {
    let stop = false;
    void load().catch(() => {
      if (!stop) setError("The lab didn't answer.");
    });
    const id = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 8000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [load]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    const token = key.trim();
    if (!token) {
      setError("That key doesn't open the gate.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/gate/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setPhase(response.status === 503 ? "down" : "locked");
        setError(data?.error || "That key doesn't open the gate.");
        return;
      }
      setKey("");
      await load();
    } catch {
      setError("The lab didn't answer.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: "accepted" | "declined") {
    setActing(id);
    setError("");
    try {
      const response = await fetch(`/api/gate/admin/requests/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-relapse-gate": "1" },
        body: JSON.stringify({ decision }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        if (response.status === 401) setPhase("locked");
        setError(data?.error || "The lab didn't answer.");
        if (response.status === 404) await load();
        return;
      }
      setRequests((current) => current.filter((item) => item.id !== id));
      setRecoveries((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("The lab didn't answer.");
    } finally {
      setActing("");
    }
  }

  return (
    <div className="desk">
      <div className="phone">
        <header className="top">
          <h1 className="word">Gate</h1>
          <p className="lede">
            Cameras waiting to come in, and profiles asking to come back. Accept lets a new camera shoot. Approve puts
            that profile on the phone that asked.
          </p>
        </header>
        <div className="stage">
          <div className="scroll">
            {phase === "checking" ? <p className="fine">Checking the gate.</p> : null}
            {phase === "down" ? (
              <p className="error" role="alert">
                {error || "The gate isn't set up on this server."}
              </p>
            ) : null}
            {phase === "locked" ? (
              <form className="stack" onSubmit={(event) => void unlock(event)}>
                <label className="section" htmlFor="gate-key">
                  Gate key
                </label>
                <input
                  id="gate-key"
                  className="field"
                  type="password"
                  name="gate-key"
                  autoComplete="current-password"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                />
                {error ? (
                  <p className="error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Checking…" : "Open"}
                </button>
              </form>
            ) : null}
            {phase === "open" ? (
              <>
                {error ? (
                  <p className="error" role="alert">
                    {error}
                  </p>
                ) : null}
                {requests.length === 0 && recoveries.length === 0 ? (
                  <div className="empty">
                    <h2>Nobody waiting</h2>
                    <p>New requests show up here.</p>
                  </div>
                ) : null}
                {requests.length > 0 ? (
                  <ul className="gate-list" data-gate-list="join">
                    {requests.map((item) => (
                      <li key={item.id} className="event">
                        <p className="kicker">New camera</p>
                        <h3>{item.name}</h3>
                        <time dateTime={new Date(item.createdAt).toISOString()}>{when(item.createdAt)}</time>
                        <div className="gate-actions">
                          <button
                            className="primary"
                            type="button"
                            disabled={acting === item.id}
                            onClick={() => void decide(item.id, "accepted")}
                          >
                            Accept
                          </button>
                          <button
                            className="ghost"
                            type="button"
                            disabled={acting === item.id}
                            onClick={() => void decide(item.id, "declined")}
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {recoveries.length > 0 ? (
                  <ul className="gate-list" data-gate-list="recover">
                    {recoveries.map((item) => (
                      <li key={item.id} className="event">
                        <p className="kicker">Bring back</p>
                        <h3>{item.name}</h3>
                        <time dateTime={new Date(item.createdAt).toISOString()}>{when(item.createdAt)}</time>
                        <div className="gate-actions">
                          <button
                            className="primary"
                            type="button"
                            disabled={acting === item.id}
                            onClick={() => void decide(item.id, "accepted")}
                          >
                            Approve
                          </button>
                          <button
                            className="ghost"
                            type="button"
                            disabled={acting === item.id}
                            onClick={() => void decide(item.id, "declined")}
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
