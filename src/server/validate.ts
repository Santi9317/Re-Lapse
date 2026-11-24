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

export function cleanCaption(value: unknown): string {
  const caption = scrub(value ?? "", 80, true);
  if (caption == null) throw new HttpError(400, "Keep the caption short.");
  return caption;
}

export function cleanHours(value: unknown): number {
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(hours) || hours < 8 || hours > 24) {
    throw new HttpError(400, "An event stays open between 8 and 24 hours.");
  }
  return hours;
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
