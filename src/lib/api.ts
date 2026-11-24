import type { Album, EventDetail, EventRoll, FeedItem, LabItem } from "@/lib/types";

const DEV_KEY = "relapse.devtimers";
const TOKEN_KEY = "relapse.shooter";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function localHost(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function captureDevFlag() {
  if (typeof window === "undefined") return;
  try {
    if (!localHost()) return;
    const query = new URLSearchParams(window.location.search);
    if (query.get("devtimers") === "1") sessionStorage.setItem(DEV_KEY, "1");
    if (query.get("devtimers") === "0") sessionStorage.removeItem(DEV_KEY);
  } catch {
    /* session storage can be blocked */
  }
}

captureDevFlag();

export function devFlagStored(): boolean {
  try {
    if (typeof window === "undefined" || !localHost()) return false;
    return sessionStorage.getItem(DEV_KEY) === "1";
  } catch {
    return false;
  }
}

export function shooterToken(): string {
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing && UUID.test(existing)) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

function headers(jsonBody: boolean): HeadersInit {
  const token = shooterToken();
  const result: Record<string, string> = { "x-shooter-token": token };
  if (jsonBody) result["content-type"] = "application/json";
  if (devFlagStored()) result["x-relapse-dev"] = "1";
  return result;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || "The lab didn't answer.");
  return data as T;
}

export function fetchConfig(): Promise<{ devTimers: boolean }> {
  return request("/api/config");
}

export function fetchFeed(): Promise<{ photos: FeedItem[] }> {
  return request("/api/feed", { headers: headers(false) });
}

export function fetchLab(): Promise<{ photos: LabItem[] }> {
  return request("/api/lab", { headers: headers(false) });
}

export function sendPhoto(input: {
  imageBase64: string;
  caption: string;
  eventId: string | null;
}): Promise<{ id: string; readyAt: number; createdAt: number; labState: string; eventId: string | null }> {
  return request("/api/photos", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ ...input, shooterToken: shooterToken() }),
  });
}

export function developPhoto(id: string): Promise<{ developedAt: number }> {
  return request(`/api/photos/${id}/develop`, { method: "POST", headers: headers(false) });
}

export function publishPhoto(id: string): Promise<{ publishedAt: number }> {
  return request(`/api/photos/${id}/publish`, { method: "POST", headers: headers(false) });
}

export function filePhoto(id: string, albumId: string | null): Promise<{ ok: boolean }> {
  return request(`/api/photos/${id}/album`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ albumId }),
  });
}

export async function fetchAlbums(): Promise<Album[]> {
  const data = await request<{ albums: Album[] }>("/api/albums");
  return data.albums;
}

export function createAlbum(name: string): Promise<Album> {
  return request("/api/albums", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ name }),
  });
}

export function fetchAlbum(id: string): Promise<{ album: Album; photos: FeedItem[] }> {
  return request(`/api/albums/${id}`, { headers: headers(false) });
}

export async function fetchEvents(): Promise<EventRoll[]> {
  const data = await request<{ events: EventRoll[] }>("/api/events");
  return data.events;
}

export function createEvent(name: string, durationHours: number): Promise<EventRoll> {
  return request("/api/events", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ name, durationHours }),
  });
}

export function fetchEvent(id: string): Promise<EventDetail> {
  return request(`/api/events/${id}`, { headers: headers(false) });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const stride = 0x8000;
  for (let i = 0; i < bytes.length; i += stride) {
    binary += String.fromCharCode(...bytes.subarray(i, i + stride));
  }
  return btoa(binary);
}
