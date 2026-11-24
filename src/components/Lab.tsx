"use client";

import { useEffect, useState } from "react";
import { developPhoto, fetchLab, shooterToken } from "@/lib/api";
import { countdown, longRemain } from "@/lib/format";
import type { LabItem } from "@/lib/types";

export function Lab({ revision, onDeveloped }: { revision: number; onDeveloped: () => void }) {
  const [items, setItems] = useState<LabItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [token] = useState(() => shooterToken());

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const data = await fetchLab();
        if (!stop) {
          setItems(data.photos);
          setError("");
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "The lab didn't answer.");
      }
    }
    void load();
    const poll = window.setInterval(() => void load(), 4000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [revision]);

  async function develop(id: string) {
    setBusy(id);
    setError("");
    try {
      await developPhoto(id);
      setItems((current) => current.filter((item) => item.id !== id));
      onDeveloped();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame can't be developed yet.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scroll" data-screen="lab">
      {error ? <p className="error">{error}</p> : null}
      {items.length === 0 ? (
        <div className="empty">
          <h2>Nothing in the soup.</h2>
          <p>Shoot a frame. It waits here, off the shared feed, until you develop it.</p>
        </div>
      ) : (
        items.map((item) => {
          const remaining = item.readyAt - now;
          const ready = item.labState !== "sealed" && (item.labState === "ready" || remaining <= 0);
          return (
            <article className="lab-card" key={item.id} data-lab-state={item.labState === "sealed" ? "sealed" : ready ? "ready" : "developing"}>
              {item.labState === "sealed" ? (
                <div className="thumb sealed-thumb">Sealed</div>
              ) : (
                <div className="thumb">
                  <img
                    src={`/api/photos/${item.id}/image?t=${encodeURIComponent(token)}`}
                    alt="Your frame, still developing"
                  />
                  {!ready ? <div className="safelight" /> : null}
                </div>
              )}
              <div>
                {item.labState === "sealed" ? (
                  <>
                    <div className="kicker">Sealed</div>
                    <h2 className="time" style={{ fontSize: 32 }}>{item.eventName}</h2>
                    <p>
                      Comes back with the roll
                      {item.revealAt ? ` in ${longRemain(item.revealAt - now)}` : ""}. Nobody can see it yet.
                    </p>
                  </>
                ) : ready ? (
                  <>
                    <div className="kicker">Ready</div>
                    <p>{item.caption || "No caption."}</p>
                    <button
                      className="primary"
                      type="button"
                      data-develop={item.id}
                      disabled={busy === item.id}
                      onClick={() => void develop(item.id)}
                    >
                      {busy === item.id ? "Developing…" : "Develop"}
                    </button>
                    <p>This puts it on the shared feed.</p>
                  </>
                ) : (
                  <>
                    <div className="kicker">Developing</div>
                    <div className="time" data-countdown={item.id}>{countdown(remaining)}</div>
                    <p>Off the feed until you develop it.</p>
                  </>
                )}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
