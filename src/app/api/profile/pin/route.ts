import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { normalizePin } from "@/server/pin";
import { recoveryPinSet, saveRecoveryPin } from "@/server/profile-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = await requireMember(request);
    return json({ set: await recoveryPinSet(token) });
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
    if (!saved) return json({ error: "Enter a 6-digit PIN." }, 400);
    return json({ set: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
