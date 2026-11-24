import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { takeGateGuess } from "@/server/gate";
import { GATE_GUESS_DELAY_MS, gateCookie, gateSecret } from "@/server/gate-key";
import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { isUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tryClient(request: Request): string {
  const header = request.headers.get("cookie") ?? "";
  const prefix = "relapse_try=";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    let value = "";
    try {
      value = decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      break;
    }
    if (isUuid(value)) return value.toLowerCase();
  }
  return randomUUID();
}

function sealTry(response: NextResponse, request: Request, clientId: string) {
  const secure = new URL(request.url).protocol === "https:";
  response.cookies.set("relapse_try", clientId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function POST(request: Request) {
  const clientId = tryClient(request);
  try {
    const secret = gateSecret();
    if (!secret) return json({ error: "The gate isn't set up on this server." }, 503);
    const body = asRecord(await readJson(request));
    const given = typeof body.token === "string" ? body.token.trim() : "";
    const outcome = await takeGateGuess(clientId, given, secret);
    if (outcome === "ok") {
      const response = json({ ok: true });
      const secure = new URL(request.url).protocol === "https:";
      response.cookies.set("relapse_gate", gateCookie(secret), {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return sealTry(response, request, clientId);
    }
    await new Promise((resolve) => setTimeout(resolve, GATE_GUESS_DELAY_MS));
    if (outcome === "blocked") {
      return sealTry(json({ error: "The gate needs a minute. Try again shortly." }, 429), request, clientId);
    }
    return sealTry(json({ error: "That key doesn't open the gate." }, 401), request, clientId);
  } catch (error) {
    return sealTry(toErrorResponse(error), request, clientId);
  }
}
