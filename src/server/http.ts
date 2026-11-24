import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

const BOOTH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      return "";
    }
  }
  return "";
}

/** The browser booth for a new camera id. Address headers are not consulted. */
export function readBooth(request: Request): string {
  const value = cookieValue(request, "relapse_booth");
  if (BOOTH_UUID.test(value)) return value.toLowerCase();
  return randomUUID();
}

export function sealCamera(response: NextResponse, request: Request, token: string, proof: string) {
  const secure = new URL(request.url).protocol === "https:";
  response.cookies.set("relapse_auth", `${token}.${proof}`, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 31_536_000,
  });
  return response;
}

export function sealBooth(response: NextResponse, request: Request, booth: string) {
  const secure = new URL(request.url).protocol === "https:";
  response.cookies.set("relapse_booth", booth, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 31_536_000,
  });
  return response;
}

export function toErrorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : "unknown";
  console.error("relapse", message.slice(0, 300));
  return json({ error: "The lab hit a snag." }, 500);
}

export const JSON_BODY_BYTES = 8_000;
export const PHOTO_BODY_BYTES = 2_200_000;

export async function readJson(request: Request, maxBytes = JSON_BODY_BYTES): Promise<unknown> {
  const advertised = Number(request.headers.get("content-length") || "");
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    throw new HttpError(413, "That request is too big.");
  }
  const body = request.body;
  if (!body) throw new HttpError(400, "The lab couldn't read that.");

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (total + value.byteLength > maxBytes) {
        throw new HttpError(413, "That request is too big.");
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  reader.releaseLock();

  if (total === 0) throw new HttpError(400, "The lab couldn't read that.");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(400, "The lab couldn't read that.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "The lab couldn't read that.");
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "The lab couldn't read that.");
  }
  return value as Record<string, unknown>;
}
