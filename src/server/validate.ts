import { CAROUSEL_LIMIT, isEmoji } from "@/lib/profile";
import type { ProfilePatch } from "@/lib/types";
import { cameraAuthFromCookie } from "@/server/camera-auth";
import { HttpError } from "@/server/http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function requireUuid(value: unknown, message: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new HttpError(400, message);
  return value.toLowerCase();
}

export function optionalUuid(value: unknown): string | null {
  if (value == null || value === "") return null;
  return requireUuid(value, "That id is not one of ours.");
}

function scrub(value: unknown, max: number, emptyOk: boolean): string | null {
  if (value == null) return emptyOk ? "" : null;
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > max) return null;
  if (!emptyOk && text.length === 0) return null;
  return text;
}

export function cleanName(value: unknown): string {
  const name = scrub(value, 40, false);
  if (!name) throw new HttpError(400, "Give it a short name.");
  return name;
}

export function cleanStickerEmoji(value: unknown): string {
  if (typeof value !== "string" || !isEmoji(value)) throw new HttpError(400, "Pick an emoji.");
  return value;
}

export function cleanCaption(value: unknown): string {
  const caption = scrub(value ?? "", 80, true);
  if (caption == null) throw new HttpError(400, "Keep the caption short.");
  return caption;
}

/**
 * Only keys the request actually sent. A missing key is not a clear:
 * editing a name must not wipe the portrait, the strip, or the PIN.
 */
export function cleanProfilePatch(body: Record<string, unknown>): ProfilePatch {
  const patch: ProfilePatch = {};
  if ("username" in body) {
    const username = scrub(body.username, 24, false);
    if (!username) throw new HttpError(400, "Give yourself a short name.");
    patch.username = username;
  }
  if ("emojis" in body) {
    if (!Array.isArray(body.emojis) || body.emojis.length !== 3) {
      throw new HttpError(400, "Pick three emojis.");
    }
    patch.emojis = body.emojis.map((item) => {
      if (typeof item !== "string" || !isEmoji(item)) throw new HttpError(400, "Pick three emojis.");
      return item;
    }) as [string, string, string];
  }
  if ("carouselIds" in body) patch.carouselIds = cleanIdList(body.carouselIds);
  const mentionsAvatar = "avatarPhotoId" in body || "avatarImageBase64" in body || "keepUpload" in body;
  if (mentionsAvatar) {
    let avatarImageBase64: string | null = null;
    if (typeof body.avatarImageBase64 === "string" && body.avatarImageBase64 !== "") {
      avatarImageBase64 = cleanJpeg(body.avatarImageBase64);
      if (avatarImageBase64.length > 450_000) throw new HttpError(413, "That photo is too heavy.");
    }
    const avatarPhotoId = avatarImageBase64 ? null : optionalUuid(body.avatarPhotoId);
    const keepUpload = body.keepUpload === true && !avatarPhotoId && !avatarImageBase64;
    if (!keepUpload) {
      patch.avatarPhotoId = avatarPhotoId;
      patch.avatarImageBase64 = avatarImageBase64;
      patch.keepUpload = false;
    }
  }
  return patch;
}

function cleanIdList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new HttpError(400, "The strip needs a list of frames.");
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = optionalUuid(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length > CAROUSEL_LIMIT) throw new HttpError(400, "The strip holds 17 frames.");
  }
  return ids;
}

export function cleanHours(value: unknown): number {
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
    throw new HttpError(400, "A roll stays open between 1 and 24 hours.");
  }
  return hours;
}

const INVITE_CODE = /^[A-HJ-NP-Z2-9]{6,12}$/;

export function readCameraAuth(request: Request): { token: string; proof: string } | null {
  return cameraAuthFromCookie(request.headers.get("cookie"));
}

/** Proof sealed in the httpOnly cookie. Request headers are not accepted. */
export function readProof(request: Request): string | null {
  return readCameraAuth(request)?.proof ?? null;
}

export function cleanInviteCode(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "That invite isn't one of ours.");
  const code = value.replace(/[\s-]/g, "").toUpperCase();
  if (!INVITE_CODE.test(code)) throw new HttpError(400, "That invite isn't one of ours.");
  return code;
}

export function cleanInviteName(value: unknown): string {
  const name = scrub(value, 24, false);
  if (!name) throw new HttpError(400, "Say who you're inviting.");
  return name;
}

export function cleanPhotoIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new HttpError(400, "Pick the frames first.");
  if (value.length > 80) throw new HttpError(400, "That's too many frames at once.");
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = requireUuid(item, "That frame isn't one of ours.");
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1] ?? 0;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

export function cleanJpeg(imageBase64: unknown): string {
  if (typeof imageBase64 !== "string") {
    throw new HttpError(400, "That frame is not a finished print.");
  }
  const cleaned = imageBase64.replace(/^data:image\/jpeg;base64,/i, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    throw new HttpError(400, "That frame is not a finished print.");
  }
  const buf = Buffer.from(cleaned, "base64");
  if (buf.length < 100 || buf.length > 1_100_000) {
    throw new HttpError(413, "That frame is too big.");
  }
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    throw new HttpError(400, "That frame is not a finished print.");
  }
  const size = jpegSize(buf);
  if (!size || size.w < 32 || size.h < 32 || size.w > 2200 || size.h > 2200) {
    throw new HttpError(400, "That frame is an odd size.");
  }
  return buf.toString("base64");
}
