import { snapshotPhone } from "@/lib/identity";
import {
  clearStoredProfile,
  loadProfile,
  profileFromServer,
  profileReady,
  saveProfile,
  storeCameraProfile,
  withCameraPortrait,
} from "@/lib/profile";
import type { Album, AlbumDetail, Chemistry, EventDetail, EventRoll, FeedItem, FrameComment, FrameSticker, GalleryCard, LabItem, ProfilePatch, SharedProfile } from "@/lib/types";

const DEV_KEY = "relapse.devtimers";
const TOKEN_KEY = "relapse.shooter";
const PROOF_KEY = "relapse.shooter.proof";
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

function clearReadableCameraCookie() {
  document.cookie = "relapse.shooter=; Path=/; Max-Age=0; SameSite=Lax";
}

function rememberCamera(token: string, snapshot = true) {
  localStorage.setItem(TOKEN_KEY, token);
  dropLegacyProof();
  clearReadableCameraCookie();
  if (snapshot) void snapshotPhone();
}

function dropLegacyProof() {
  try {
    localStorage.removeItem(PROOF_KEY);
  } catch {
    /* storage can be blocked */
  }
}

dropLegacyProof();

export type GateStatus = "pending" | "accepted" | "declined";

export async function fetchGate(): Promise<{ status: GateStatus; name: string } | null> {
  const token = shooterToken();
  const headers: Record<string, string> = {};
  if (token) headers["x-shooter-token"] = token;
  const response = await fetch("/api/gate", {
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 404) return null;
  const data = (await response.json().catch(() => null)) as { status?: string; name?: string; error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "The lab didn't answer.");
  if (data?.status !== "pending" && data?.status !== "accepted" && data?.status !== "declined") {
    throw new Error("The lab didn't answer.");
  }
  return { status: data.status, name: typeof data.name === "string" ? data.name : "" };
}

export async function requestToJoin(name: string): Promise<{ status: GateStatus; name: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = shooterToken();
  if (token) headers["x-shooter-token"] = token;
  const response = await fetchWithBooth("/api/gate", {
    method: "POST",
    headers,
    cache: "no-store",
    credentials: "same-origin",
    body: JSON.stringify({ name }),
  });
  const data = (await response.json().catch(() => null)) as {
    status?: string;
    name?: string;
    token?: string;
    error?: string;
  } | null;
  if (
    !response.ok ||
    !data?.token ||
    !UUID.test(data.token) ||
    (data.status !== "pending" && data.status !== "accepted" && data.status !== "declined")
  ) {
    throw new Error(data?.error || "The lab didn't answer.");
  }
  rememberCamera(data.token);
  return { status: data.status, name: typeof data.name === "string" ? data.name : name };
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

const BOOTH_HANDOFF = "Open the camera again.";

async function fetchWithBooth(input: string, init: RequestInit): Promise<Response> {
  let response = await fetch(input, init);
  for (let extra = 0; extra < 2 && response.status === 409; extra += 1) {
    const peek = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    if (peek?.error !== BOOTH_HANDOFF) break;
    response = await fetch(input, init);
  }
  return response;
}

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
  clearReadableCameraCookie();
  const existing = shooterToken();
  const headers: Record<string, string> = {};
  if (existing) headers["x-shooter-token"] = existing;
  const response = await fetchWithBooth("/api/camera", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  const data = (await response.json().catch(() => null)) as { token?: string; error?: string } | null;
  if (response.status === 401 && existing) return existing;
  if (!response.ok || !data?.token || !UUID.test(data.token)) {
    throw new Error(data?.error || "The lab didn't answer.");
  }
  rememberCamera(data.token);
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

export class ProfileRemovedError extends Error {
  readonly removed = true;
  constructor() {
    super("That profile is gone.");
    this.name = "ProfileRemovedError";
  }
}

export function isProfileRemoved(error: unknown): error is ProfileRemovedError {
  return error instanceof ProfileRemovedError;
}

export async function fetchOwnProfile(): Promise<SharedProfile | null> {
  const response = await fetch("/api/profile", { headers: await headers(false), cache: "no-store" });
  if (response.status === 404) return null;
  const data = (await response.json().catch(() => null)) as (SharedProfile & { error?: string; removed?: boolean }) | null;
  if (response.status === 410 && data?.removed === true) {
    await clearStoredProfile();
    throw new ProfileRemovedError();
  }
  if (!response.ok) throw new Error(data?.error || "The lab didn't answer.");
  return withGalleries(data as SharedProfile);
}

export async function saveOwnProfile(
  profile: ProfilePatch,
  options?: { replaceRemoved?: boolean },
): Promise<SharedProfile> {
  const requestHeaders = await headers(true);
  if (options?.replaceRemoved) requestHeaders["x-relapse-replace-profile"] = "1";
  const response = await fetch("/api/profile", {
    method: "PUT",
    headers: requestHeaders,
    body: JSON.stringify(profile),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as (SharedProfile & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || "The lab didn't answer.");
  return withGalleries({
    id: data.id,
    username: data.username,
    emojis: data.emojis,
    avatarPhotoId: data.avatarPhotoId,
    avatarUrl: data.avatarUrl,
    carouselIds: data.carouselIds,
    galleries: data.galleries,
  });
}

function withGalleries(profile: SharedProfile): SharedProfile {
  return { ...profile, galleries: galleryCards(profile.galleries) };
}

function galleryCards(value: unknown): GalleryCard[] {
  if (!Array.isArray(value)) return [];
  const cards: GalleryCard[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    cards.push({
      id: row.id,
      name: row.name,
      frameCount: typeof row.frameCount === "number" ? row.frameCount : 0,
      coverPhotoId: typeof row.coverPhotoId === "string" ? row.coverPhotoId : null,
    });
  }
  return cards;
}

export async function adoptSavedProfile(): Promise<void> {
  const remote = await fetchOwnProfile();
  if (!remote) return;
  const saved = withCameraPortrait(profileFromServer(remote), loadProfile());
  if (!profileReady(saved)) return;
  storeCameraProfile(saved);
}

export async function fetchRecoveryPin(): Promise<boolean> {
  const response = await fetch("/api/profile/pin", { headers: await headers(false), cache: "no-store" });
  const data = (await response.json().catch(() => null)) as { set?: unknown; error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "The lab didn't answer.");
  return data?.set === true;
}

export async function saveRecoveryPin(pin: string): Promise<void> {
  const response = await fetch("/api/profile/pin", {
    method: "PUT",
    headers: await headers(true),
    cache: "no-store",
    body: JSON.stringify({ pin }),
  });
  const data = (await response.json().catch(() => null)) as { set?: unknown; error?: string } | null;
  if (!response.ok || data?.set !== true) {
    throw new Error(data?.error || "The lab didn't answer.");
  }
}

export async function requestRecovery(name: string, pin: string): Promise<{ status: GateStatus; name: string }> {
  const response = await fetchWithBooth("/api/gate/pin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    body: JSON.stringify({ name, pin }),
  });
  const data = (await response.json().catch(() => null)) as { status?: string; name?: string; error?: string } | null;
  if (data?.status !== "pending" && data?.status !== "accepted" && data?.status !== "declined") {
    throw new Error(data?.error || "That name and PIN don't match a profile.");
  }
  return { status: data.status, name: typeof data.name === "string" ? data.name : "" };
}

/**
 * The accepted rescue already sealed this phone's camera cookie.
 * Copy that camera into local storage. The token already stored here is sent
 * along, so a missing cookie cannot mint a new camera.
 */
async function installRecoveredCamera(): Promise<void> {
  const response = await fetchWithBooth("/api/camera", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => null)) as { token?: string; error?: string } | null;
  if (!response.ok || !data?.token || !UUID.test(data.token)) {
    throw new Error(data?.error || "The lab didn't answer.");
  }
  rememberCamera(data.token, false);
  issuing = Promise.resolve(data.token);
}

/**
 * Read the rescue this phone asked for.
 * `replaceDevice` is the You menu. An accepted rescue has already sealed this
 * phone's camera. The profile stored for the previous one is dropped, then the
 * recovered profile is kept when it is ready. The gate leaves this off.
 */
export async function fetchRescue(options?: {
  replaceDevice?: boolean;
}): Promise<{ status: GateStatus; name: string } | null> {
  const response = await fetch("/api/gate/pin", { cache: "no-store", credentials: "same-origin" });
  const data = (await response.json().catch(() => null)) as {
    status?: string;
    name?: string;
    profile?: SharedProfile;
    error?: string;
  } | null;
  if (response.status === 404) return null;
  if (
    !response.ok ||
    (data?.status !== "pending" && data?.status !== "accepted" && data?.status !== "declined")
  ) {
    throw new Error(data?.error || "The lab didn't answer.");
  }
  if (data.status === "accepted") {
    if (options?.replaceDevice) await installRecoveredCamera();
    else await ensureCamera();
    if (options?.replaceDevice) await clearStoredProfile();
    if (data.profile) {
      try {
        const saved = profileFromServer(data.profile);
        if (profileReady(saved)) saveProfile(saved);
      } catch {
        /* the server still has the profile */
      }
    }
  }
  return { status: data.status, name: typeof data.name === "string" ? data.name : "" };
}

export async function fetchPublicProfile(id: string): Promise<SharedProfile> {
  if (!UUID.test(id)) throw new Error("That profile is gone.");
  return withGalleries(await request<SharedProfile>(`/api/profiles/${id}`, { headers: await headers(false) }));
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
  albumId?: string | null;
  dateStamp?: boolean;
  capturedAt?: number | null;
}): Promise<{ id: string; readyAt: number; createdAt: number; labState: string; eventId: string | null }> {
  const token = await ensureCamera();
  return request("/api/photos", {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ ...input, shooterToken: token }),
  });
}

export async function developPhoto(
  id: string,
  print?: { imageBase64: string; chemistry: Chemistry },
): Promise<{ developedAt: number }> {
  return request(`/api/photos/${id}/develop`, {
    method: "POST",
    headers: await headers(Boolean(print)),
    body: print ? JSON.stringify(print) : undefined,
  });
}

export async function chooseChemistry(
  id: string,
  chemistry: Chemistry | null,
): Promise<{ chemistry: Chemistry | null; develop: boolean }> {
  return request(`/api/photos/${id}/chemistry`, {
    method: "PATCH",
    headers: await headers(true),
    body: JSON.stringify({ chemistry }),
  });
}

export async function fetchLatent(id: string): Promise<Blob> {
  const response = await fetch(`/api/photos/${id}/latent`, {
    headers: await headers(false),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("That frame isn't ready for a bath.");
  return response.blob();
}

export async function updateCaption(id: string, caption: string): Promise<{ caption: string }> {
  return request(`/api/photos/${id}`, {
    method: "PATCH",
    headers: await headers(true),
    body: JSON.stringify({ caption }),
  });
}

export async function publishPhoto(id: string): Promise<{ publishedAt: number }> {
  return request(`/api/photos/${id}/publish`, { method: "POST", headers: await headers(false) });
}

export async function deletePhoto(id: string): Promise<{ ok: boolean }> {
  return request(`/api/photos/${id}`, { method: "DELETE", headers: await headers(false) });
}

export async function setFrameSticker(id: string, emoji: string): Promise<{ stickers: FrameSticker[] }> {
  return request(`/api/photos/${id}/sticker`, {
    method: "PUT",
    headers: await headers(true),
    body: JSON.stringify({ emoji }),
  });
}

export async function moveFrameSticker(
  id: string,
  stickerId: string,
  x: number,
  y: number,
): Promise<{ stickers: FrameSticker[] }> {
  return request(`/api/photos/${id}/sticker`, {
    method: "PATCH",
    headers: await headers(true),
    body: JSON.stringify({ id: stickerId, x, y }),
  });
}

export async function removeFrameSticker(id: string, stickerId: string): Promise<{ stickers: FrameSticker[] }> {
  return request(`/api/photos/${id}/sticker`, {
    method: "DELETE",
    headers: await headers(true),
    body: JSON.stringify({ id: stickerId }),
  });
}

export async function setFrameNote(id: string, text: string): Promise<{ comments: FrameComment[] }> {
  return request(`/api/photos/${id}/note`, {
    method: "PUT",
    headers: await headers(true),
    body: JSON.stringify({ text }),
  });
}

export async function removeFrameNote(id: string, noteId: string): Promise<{ comments: FrameComment[] }> {
  return request(`/api/photos/${id}/note`, {
    method: "DELETE",
    headers: await headers(true),
    body: JSON.stringify({ id: noteId }),
  });
}

export async function filePhoto(id: string, albumId: string | null, remove = false): Promise<{ ok: boolean }> {
  return request(`/api/photos/${id}/album`, {
    method: "PATCH",
    headers: await headers(true),
    body: JSON.stringify({ albumId, remove }),
  });
}

export async function fetchAlbums(): Promise<Album[]> {
  const data = await request<{ albums: Album[] }>("/api/albums", { headers: await headers(false) });
  return data.albums;
}

export async function createAlbum(name: string): Promise<Album> {
  return request("/api/albums", {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ name }),
  });
}

export async function fetchAlbum(id: string): Promise<AlbumDetail> {
  return request(`/api/albums/${id}`, { headers: await headers(false) });
}

export async function updateAlbum(
  id: string,
  patch: { name?: string; coverPhotoId?: string | null },
): Promise<Album> {
  return request(`/api/albums/${id}`, {
    method: "PATCH",
    headers: await headers(true),
    body: JSON.stringify(patch),
  });
}

export async function deleteAlbum(id: string): Promise<{ ok: boolean }> {
  return request(`/api/albums/${id}`, { method: "DELETE", headers: await headers(false) });
}

export async function fetchEvents(): Promise<EventRoll[]> {
  const data = await request<{ events: EventRoll[] }>("/api/events", { headers: await headers(false) });
  return data.events;
}

export async function createEvent(name: string, durationHours: number, startsAt: number): Promise<EventRoll> {
  return request("/api/events", {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ name, durationHours, startsAt }),
  });
}

export async function fetchEvent(id: string): Promise<EventDetail> {
  return request(`/api/events/${id}`, { headers: await headers(false) });
}

export async function joinEvent(code: string): Promise<EventDetail> {
  return request("/api/events/join", {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ code }),
  });
}

export async function inviteToEvent(id: string, username: string): Promise<EventDetail> {
  return request(`/api/events/${id}/invites`, {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ username }),
  });
}

export async function publishEventFeed(id: string, photoIds: string[]): Promise<EventDetail> {
  return request(`/api/events/${id}/feed`, {
    method: "POST",
    headers: await headers(true),
    body: JSON.stringify({ photoIds }),
  });
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
