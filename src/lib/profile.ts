import type { ProfileWrite, SharedProfile } from "@/lib/types";

export const CAROUSEL_LIMIT = 17;
export const NAME_LIMIT = 24;

const STORAGE_KEY = "relapse.profile";
const DRAFT_KEY = "relapse.profile.draft";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_URL = /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i;
const AVATAR_URL = /^\/api\/(?:profiles\/[0-9a-f-]{36}\/avatar|photos\/[0-9a-f-]{36}\/image)$/i;
const MAX_DATA_URL = 450_000;

export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Faces",
    emojis: ["😀", "😁", "😂", "🤣", "😊", "😉", "😍", "😘", "😎", "🤓", "🧐", "🤠", "😇", "🥳", "😤", "😴", "🤔", "😌", "😏", "🙃", "😅", "😭", "🥺", "😈"],
  },
  {
    label: "Marks",
    emojis: ["❤️", "🖤", "🤍", "💛", "💙", "💜", "💖", "✨", "⭐", "🔥", "💫", "⚡", "🌟", "💯", "🍀", "🌈", "🌙", "☀️"],
  },
  {
    label: "World",
    emojis: ["🌸", "🌻", "🌺", "🌹", "🌊", "🌿", "🍁", "❄️", "🌵", "🍄", "🐝", "🦋", "🐢", "🐱", "🐶", "🦊", "🐻", "🐸", "🦄", "🐼", "🦁", "🐧", "🐺", "🐙"],
  },
  {
    label: "Play",
    emojis: ["🎨", "📚", "🎵", "🎸", "🎮", "⚽", "🏀", "🧘", "🏃", "🚴", "✈️", "🏕️", "🎬", "📷", "🎧", "🎤", "✍️", "🧩", "🎯", "🎲", "☕", "🍵", "🍕", "🍰", "👑", "🚀", "🪩", "💀", "👽", "🤖"],
  },
];

export const EMOJI_CHOICES = EMOJI_GROUPS.flatMap((group) => group.emojis);

export type Profile = {
  username: string;
  emojis: [string, string, string];
  avatarPhotoId: string | null;
  avatarDataUrl: string | null;
  avatarUrl: string | null;
  carouselIds: string[];
};

type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: "grapheme" | "word" | "sentence" },
) => { segment: (input: string) => Iterable<{ segment: string }> };

function graphemes(value: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterCtor }).Segmenter;
  if (!Segmenter) return [...value];
  return [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((part) => part.segment);
}

export function isEmoji(value: string): boolean {
  if (!value || value.length > 32) return false;
  const parts = graphemes(value);
  if (parts.length !== 1) return false;
  return /\p{Extended_Pictographic}/u.test(parts[0]);
}

export function takeEmoji(value: string): string {
  for (const part of graphemes(value.trim())) {
    if (isEmoji(part)) return part;
  }
  return "";
}

export function emptyProfile(): Profile {
  return {
    username: "",
    emojis: ["", "", ""],
    avatarPhotoId: null,
    avatarDataUrl: null,
    avatarUrl: null,
    carouselIds: [],
  };
}

function cleanUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_LIMIT);
  return text;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string" || !UUID.test(value)) return null;
  return value.toLowerCase();
}

function cleanAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || !AVATAR_URL.test(value)) return null;
  return value;
}

function cleanDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 32 || compact.length > MAX_DATA_URL) return null;
  if (!DATA_URL.test(compact)) return null;
  return compact;
}

function cleanEmojis(value: unknown): [string, string, string] {
  const source = Array.isArray(value) ? value : [];
  const next: [string, string, string] = ["", "", ""];
  for (let index = 0; index < 3; index += 1) {
    const item = source[index];
    next[index] = typeof item === "string" && isEmoji(item) ? item : "";
  }
  return next;
}

function cleanCarousel(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = cleanId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length === CAROUSEL_LIMIT) break;
  }
  return ids;
}

export function normalizeProfile(raw: unknown): Profile {
  const blank = emptyProfile();
  if (!raw || typeof raw !== "object") return blank;
  const row = raw as Record<string, unknown>;
  const avatarDataUrl = cleanDataUrl(row.avatarDataUrl);
  const avatarPhotoId = avatarDataUrl ? null : cleanId(row.avatarPhotoId);
  return {
    username: cleanUsername(row.username),
    emojis: cleanEmojis(row.emojis),
    avatarPhotoId,
    avatarDataUrl,
    avatarUrl: avatarDataUrl || avatarPhotoId ? null : cleanAvatarUrl(row.avatarUrl),
    carouselIds: cleanCarousel(row.carouselIds),
  };
}

export function profileFromServer(row: SharedProfile): Profile {
  return normalizeProfile({
    username: row.username,
    emojis: row.emojis,
    avatarPhotoId: row.avatarPhotoId,
    avatarUrl: row.avatarUrl,
    carouselIds: row.carouselIds,
  });
}

export function profileWrite(profile: Profile): ProfileWrite {
  const clean = normalizeProfile(profile);
  if (!clean.username) throw new Error("Give yourself a short name.");
  if (clean.emojis.some((emoji) => emoji.length === 0)) throw new Error("Pick three emojis.");
  const avatarImageBase64 = clean.avatarDataUrl
    ? clean.avatarDataUrl.replace(/^data:image\/jpeg;base64,/i, "")
    : null;
  return {
    username: clean.username,
    emojis: clean.emojis,
    avatarPhotoId: avatarImageBase64 ? null : clean.avatarPhotoId,
    avatarImageBase64,
    keepUpload: !avatarImageBase64 && !clean.avatarPhotoId && Boolean(clean.avatarUrl?.endsWith("/avatar")),
    carouselIds: clean.carouselIds,
  };
}

export function profileReady(profile: Profile): boolean {
  return profile.username.length > 0 && profile.emojis.every((emoji) => emoji.length > 0);
}

export function profilesEqual(a: Profile, b: Profile): boolean {
  return (
    a.username === b.username &&
    a.avatarPhotoId === b.avatarPhotoId &&
    a.avatarDataUrl === b.avatarDataUrl &&
    a.avatarUrl === b.avatarUrl &&
    a.emojis[0] === b.emojis[0] &&
    a.emojis[1] === b.emojis[1] &&
    a.emojis[2] === b.emojis[2] &&
    a.carouselIds.length === b.carouselIds.length &&
    a.carouselIds.every((id, index) => id === b.carouselIds[index])
  );
}

function readStored(key: string): Profile | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = key === DRAFT_KEY ? sessionStorage.getItem(key) : localStorage.getItem(key);
    if (!raw) return null;
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadProfile(): Profile {
  return readStored(STORAGE_KEY) ?? emptyProfile();
}

export function loadDraft(): Profile | null {
  return readStored(DRAFT_KEY);
}

export function storeDraft(profile: Profile): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(normalizeProfile(profile)));
  } catch {
    /* a draft is optional */
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* already gone */
  }
}

export function saveProfile(profile: Profile): Profile {
  const clean = normalizeProfile(profile);
  if (!clean.username) throw new Error("Give yourself a short name.");
  if (clean.emojis.some((emoji) => emoji.length === 0)) throw new Error("Pick three emojis.");
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...clean }));
  } catch {
    throw new Error("This device couldn't keep the profile.");
  }
  clearDraft();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("relapse-profile"));
  return clean;
}

export function moveCarouselId(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function toggleCarouselId(ids: string[], id: string): { ids: string[]; full: boolean } {
  const clean = cleanId(id);
  if (!clean) return { ids, full: false };
  if (ids.includes(clean)) return { ids: ids.filter((item) => item !== clean), full: false };
  if (ids.length >= CAROUSEL_LIMIT) return { ids, full: true };
  return { ids: [...ids, clean], full: false };
}

export async function portraitFromFile(file: File): Promise<string> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("Choose a photo.");
  if (file.size > 12_000_000) throw new Error("That photo is too heavy.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo can't be read. Try a JPEG.");
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error("This photo can't be read.");
    let dataUrl = await renderJpeg(bitmap, 640, 0.82);
    if (dataUrl.length > MAX_DATA_URL) dataUrl = await renderJpeg(bitmap, 480, 0.72);
    if (!DATA_URL.test(dataUrl) || dataUrl.length > MAX_DATA_URL) {
      throw new Error("That photo is too heavy. Try another.");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}

async function renderJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<string> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This photo can't be read.");
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This photo can't be read.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This photo can't be read."));
    reader.readAsDataURL(blob);
  });
  return dataUrl;
}
