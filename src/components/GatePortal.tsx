"use client";

import { useCallback, useEffect, useState } from "react";
import { GuestProfile } from "@/components/Profile";
import type { SharedProfile } from "@/lib/types";

type Pending = { id: string; name: string; createdAt: number };
type ActiveProfile = {
  id: string;
  username: string;
  emojis: [string, string, string];
  updatedAt: number;
};
type Phase = "checking" | "locked" | "open" | "down";

function asProfiles(value: unknown): ActiveProfile[] {
  if (!Array.isArray(value)) return [];
  const profiles: ActiveProfile[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.username !== "string") continue;
    const marks = Array.isArray(row.emojis) ? row.emojis.slice(0, 3).map((part) => String(part ?? "")) : [];
    while (marks.length < 3) marks.push("");
    const updatedAt = typeof row.updatedAt === "number" ? row.updatedAt : Number(row.updatedAt);
    profiles.push({
      id: row.id,
      username: row.username,
      emojis: [marks[0] ?? "", marks[1] ?? "", marks[2] ?? ""] as [string, string, string],
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    });
  }
  return profiles;
}

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
  const [profiles, setProfiles] = useState<ActiveProfile[]>([]);
  const [confirmId, setConfirmId] = useState("");
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
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
      profiles?: unknown;
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
      setProfiles([]);
      setConfirmId("");
      setOpenProfileId(null);
      return;
    }
    if (!response.ok || !data?.requests || !Array.isArray(data.profiles)) {
      setError(data?.error || "The lab didn't answer.");
      return;
    }
    const nextProfiles = asProfiles(data.profiles);
    setPhase("open");
    setError("");
    setRequests(data.requests);
    setRecoveries(data.recoveries ?? []);
    setProfiles(nextProfiles);
    setConfirmId((current) => (current && nextProfiles.some((item) => item.id === current) ? current : ""));
    setOpenProfileId((current) => (current && nextProfiles.some((item) => item.id === current) ? current : null));
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

  async function removeProfile(id: string) {
    setActing(id);
    setError("");
    try {
      const response = await fetch(`/api/gate/admin/profiles/${id}`, {
        method: "DELETE",
        headers: { "x-relapse-gate": "1" },
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        if (response.status === 401) {
          setPhase("locked");
          setProfiles([]);
          setConfirmId("");
          setOpenProfileId(null);
        }
        setError(data?.error || "The lab didn't answer.");
        if (response.status === 404) await load();
        return;
      }
      setProfiles((current) => current.filter((item) => item.id !== id));
      setConfirmId("");
    } catch {
      setError("The lab didn't answer.");
    } finally {
      setActing("");
    }
  }

  const loadGateProfile = useCallback(async (id: string): Promise<SharedProfile> => {
    const response = await fetch(`/api/gate/admin/profiles/${id}`, {
      headers: { "x-relapse-gate": "1" },
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as (SharedProfile & { error?: string }) | null;
    if (response.status === 401) {
      setPhase("locked");
      setOpenProfileId(null);
    }
    if (!response.ok || !data?.username) throw new Error(data?.error || "That profile is gone.");
    return data;
  }, []);

  return (
    <div className="desk">
      <div className="phone">
        <header className="top">
          <h1 className="word">Gate</h1>
          <p className="lede">
            {openProfileId
              ? "Their profile, from the gate."
              : "Cameras waiting to come in, and profiles asking to come back. Accept lets a new camera shoot. Approve puts that profile on the phone that asked. Every profile already in the app is listed below. Tap a name to open it. Delete takes it out."}
          </p>
        </header>
        <div className="stage">
          {phase === "open" && openProfileId ? (
            <GuestProfile id={openProfileId} onBack={() => setOpenProfileId(null)} load={loadGateProfile} />
          ) : (
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
                <section className="gate-profiles" data-gate-profiles>
                  <h2 className="section">Profiles</h2>
                  {profiles.length === 0 ? (
                    <div className="empty">
                      <h2>No profiles yet</h2>
                      <p>When someone names themselves, they show up here.</p>
                    </div>
                  ) : (
                    <ul className="gate-list" data-gate-list="profiles">
                      {profiles.map((item) => (
                        <li key={item.id} className="event" data-profile-id={item.id}>
                          <button
                            className="gate-profile"
                            type="button"
                            data-open-profile={item.id}
                            aria-label={`Open ${item.username}'s profile`}
                            onClick={() => setOpenProfileId(item.id)}
                          >
                            <p className="kicker">In the app</p>
                            <h3 data-profile-name={item.username}>{item.username}</h3>
                            <p className="gate-marks">{item.emojis.filter((emoji) => emoji.length > 0).join(" ")}</p>
                            <time dateTime={new Date(item.updatedAt).toISOString()}>{when(item.updatedAt)}</time>
                          </button>
                          <div className="gate-actions">
                            {confirmId === item.id ? (
                              <>
                                <button
                                  className="ghost"
                                  type="button"
                                  disabled={acting === item.id}
                                  onClick={() => setConfirmId("")}
                                >
                                  Keep
                                </button>
                                <button
                                  className="ghost"
                                  type="button"
                                  data-confirm-delete-profile={item.id}
                                  disabled={acting === item.id}
                                  onClick={() => void removeProfile(item.id)}
                                >
                                  {acting === item.id ? "Deleting…" : "Delete"}
                                </button>
                              </>
                            ) : (
                              <button
                                className="ghost"
                                type="button"
                                data-delete-profile={item.id}
                                aria-label={`Delete ${item.username}`}
                                onClick={() => setConfirmId(item.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          {confirmId === item.id ? <p>This takes {item.username} out of the app.</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : null}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
