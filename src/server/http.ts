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

export function toErrorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : "unknown";
  console.error("relapse", message.slice(0, 300));
  return json({ error: "The lab hit a snag." }, 500);
}

export async function readJson(request: Request, maxChars = 2_200_000): Promise<unknown> {
  const advertised = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(advertised) && advertised > maxChars) {
    throw new HttpError(413, "That frame is too big.");
  }
  const text = await request.text();
  if (text.length > maxChars) throw new HttpError(413, "That frame is too big.");
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
