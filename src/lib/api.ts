import type { Album, EventDetail, EventRoll, FeedItem, LabItem, ProfileWrite, SharedProfile } from "@/lib/types";

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
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && UUID.test(existing)) return existing;
  } catch {
    /* storage can be blocked */
  }
  return "";
}

let issuing: Promise<string> | null = null;

export function ensureCamera(): Promise<string> {
  if (!issuing) {
    issuing = requestCamera().catch((error: unknown) => {
      issuing = null;
      throw error;
    });
  }
  return issuing;
}

async function requestCamera(): Promise<string> {
  const existing = shooterToken();
  const response = await fetch("/api/camera", {
    method: "POST",
    cache: "no-store",
    headers: existing ? { "x-shooter-token": existing } : undefined,
  });
  const data = (await response.json().catch(() => null)) as { token?: string; error?: string } | null;
  if (!response.ok || !data?.token || !UUID.test(data.token)) {
    throw new Error(data?.error || "The lab didn't answer.");
  }
  localStorage.setItem(TOKEN_KEY, data.token);
  return data.token;
}

async function headers(jsonBody: boolean): Promise<Record<string, string>> {
  const token = await ensureCamera();
  const result: Record<string, string> = { "x-shooter-token": token };
  if (jsonBody) result["content-type"] = "application/json";
  if (devFlagStored()) result["x-relapse-dev"] = "1";
  return result;
}

export async function photoHeaders(): Promise<Record<string, string>> {
  return headers(false);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || "The lab didn't answer.");
  return data as T;
}

export async function fetchOwnProfile(): Promise<SharedProfile | null> {
  const response = await fetch("/api/profile", { headers: await headers(false), cache: "no-store" });
  if (response.status === 404) return null;
  const data = (await response.json().catch(() => null)) as (SharedProfile & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || "The lab didn't answer.");
  return data as SharedProfile;
}

export async function saveOwnProfile(profile: ProfileWrite): Promise<SharedProfile> {
  return request("/api/profile", {
    method: "PUT",
    headers: await headers(true),
    body: JSON.stringify(profile),
  });
}

export function fetchPublicProfile(id: string): Promise<SharedProfile> {
  return request(`/api/profiles/${id}`);
}

export function fetchConfig(): Promise<{ devTimers: boolean }> {
  return request("/api/config");
}

export async function fetchFeed(): Promise<{ photos: FeedItem[] }> {
  return request("/api/feed", { headers: await headers(false) });
}

export async function fetchLab(): Promise<{ photos: LabItem[] }> {
  return request("/api/lab", { headers: await headers(false) });
}

export async function fetchPrivateImage(id: string): Promise<Blob> {
  const response = await fetch(`/api/photos/${id}/image`, {
    headers: await headers(false),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("That frame is still hidden.");
  return response.blob();
}

export async function sendPhoto(input: {
  imageBase64: string;
  caption: string;
  eventId: string | null;
}): Promise<{ id: string; readyAt: number; createdAt: number; labState: string; eventId: string | null }> {
  const token = await ensureCamera();
  return request("/api/photos", {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ ...input, shooterToken: token }),
  });
}

export async function developPhoto(id: string): Promise<{ developedAt: number }> {
  return request(`/api/photos/${id}/develop`, { method: "POST", headers: await headers(false) });
}

export async function publishPhoto(id: string): Promise<{ publishedAt: number }> {
  return request(`/api/photos/${id}/publish`, { method: "POST", headers: await headers(false) });
}

export async function deletePhoto(id: string): Promise<{ ok: boolean }> {
  return request(`/api/photos/${id}`, { method: "DELETE", headers: await headers(false) });
}

export async function filePhoto(id: string, albumId: string | null): Promise<{ ok: boolean }> {
  return request(`/api/photos/${id}/album`, {
    method: "PATCH",
    headers: await headers(true),
    body: JSON.stringify({ albumId }),
  });
}

export async function fetchAlbums(): Promise<Album[]> {
  const data = await request<{ albums: Album[] }>("/api/albums");
  return data.albums;
}

export async function createAlbum(name: string): Promise<Album> {
  return request("/api/albums", {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ name }),
  });
}

export async function fetchAlbum(id: string): Promise<{ album: Album; photos: FeedItem[] }> {
  return request(`/api/albums/${id}`, { headers: await headers(false) });
}

export async function fetchEvents(): Promise<EventRoll[]> {
  const data = await request<{ events: EventRoll[] }>("/api/events");
  return data.events;
}

export async function createEvent(name: string, durationHours: number): Promise<EventRoll> {
  return request("/api/events", {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ name, durationHours }),
  });
}

export async function fetchEvent(id: string): Promise<EventDetail> {
  return request(`/api/events/${id}`, { headers: await headers(false) });
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
