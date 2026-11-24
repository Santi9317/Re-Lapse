"use client";

import { useEffect, useRef, useState } from "react";
import { developPhoto, fetchLab, publishPhoto, shooterToken } from "@/lib/api";
import { countdown, longRemain } from "@/lib/format";
import type { LabItem, LabState } from "@/lib/types";

function cardState(item: LabItem, now: number): LabState {
  if (item.labState === "sealed" || item.labState === "developed") return item.labState;
  if (item.labState === "ready" || item.readyAt - now <= 0) return "ready";
  return "developing";
}

export function Lab({ revision, onPublished }: { revision: number; onPublished: () => void }) {
  const [items, setItems] = useState<LabItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [token] = useState(() => shooterToken());
  const developedIds = useRef(new Set<string>());

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const data = await fetchLab();
        if (stop) return;
        for (const photo of data.photos) {
          if (photo.labState === "developed") developedIds.current.delete(photo.id);
        }
        setItems(
          data.photos.map((photo) =>
            developedIds.current.has(photo.id) ? { ...photo, labState: "developed" } : photo,
          ),
        );
        setError("");
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
      developedIds.current.add(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, labState: "developed" } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame can't be developed yet.");
    } finally {
      setBusy(null);
    }
  }

  async function publish(id: string) {
    setBusy(id);
    setError("");
    try {
      await publishPhoto(id);
      setItems((current) => current.filter((item) => item.id !== id));
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That frame isn't ready to share.");
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
          <p>Shoot a frame. It stays hidden here until the clock ends and you develop it.</p>
        </div>
      ) : (
        items.map((item) => {
          const state = cardState(item, now);
          const remaining = item.readyAt - now;
          return (
            <article className="lab-card" key={item.id} data-lab-state={state}>
              {state === "developed" ? (
                <img
                  src={`/api/photos/${item.id}/image?t=${encodeURIComponent(token)}`}
                  alt={item.caption || "Developed frame"}
                />
              ) : (
                <div className="thumb sealed-thumb" data-hidden-frame={item.id}>
                  {state === "developing" ? <div className="safelight" /> : null}
                  <span>{state === "sealed" ? "Sealed" : state === "ready" ? "Ready" : "In the soup"}</span>
                </div>
              )}
              <div>
                {state === "sealed" ? (
                  <>
                    <div className="kicker">Sealed</div>
                    <h2 className="time" style={{ fontSize: 32 }}>{item.eventName}</h2>
                    <p>
                      Comes back with the roll
                      {item.revealAt ? ` in ${longRemain(item.revealAt - now)}` : ""}. Nobody can see it yet.
                    </p>
                  </>
                ) : state === "developed" ? (
                  <>
                    <div className="kicker">Developed</div>
                    <p>{item.caption || "No caption."}</p>
                    <button
                      className="primary"
                      type="button"
                      data-publish={item.id}
                      disabled={busy === item.id}
                      onClick={() => void publish(item.id)}
                    >
                      {busy === item.id ? "Sending…" : "Send to the feed"}
                    </button>
                    <p>Only you can see it until you send it.</p>
                  </>
                ) : state === "ready" ? (
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
                    <p>Develop it to see the frame. The feed only gets it if you send it.</p>
                  </>
                ) : (
                  <>
                    <div className="kicker">Developing</div>
                    <div className="time" data-countdown={item.id}>{countdown(remaining)}</div>
                    <p>Still hidden. It stays off the feed.</p>
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
