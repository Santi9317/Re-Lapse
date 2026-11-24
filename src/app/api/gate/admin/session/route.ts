import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { gateCookie, gateSecret, sameSecret } from "@/server/gate-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const secret = gateSecret();
    if (!secret) return json({ error: "The gate isn't set up on this server." }, 503);
    const body = asRecord(await readJson(request));
    const given = typeof body.token === "string" ? body.token.trim() : "";
    if (!given || !sameSecret(given, secret)) {
      return json({ error: "That key doesn't open the gate." }, 401);
    }
    const response = json({ ok: true });
    const secure = new URL(request.url).protocol === "https:";
    response.cookies.set("relapse_gate", gateCookie(secret), {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
