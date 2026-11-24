import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { GATE_GUESS_DELAY_MS } from "@/server/gate-key";
import { normalizePin } from "@/server/pin";
import { readRecoveryPin, saveRecoveryPin } from "@/server/profile-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  try {
    const token = await requireMember(request);
    return json({ pin: await readRecoveryPin(token) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const token = await requireMember(request);
    const body = asRecord(await readJson(request));
    const pin = normalizePin(body.pin);
    if (!pin) return json({ error: "Enter a 6-digit PIN." }, 400);
    const saved = await saveRecoveryPin(token, pin);
    if (saved === "saved") return json({ pin });
    await delay(GATE_GUESS_DELAY_MS);
    if (saved === "blocked") return json({ error: "The lab needs a minute. Try again shortly." }, 429);
    return json({ error: "That PIN can't be used. Pick another." }, 409);
  } catch (error) {
    return toErrorResponse(error);
  }
}
