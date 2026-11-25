import { BOOTH_HANDOFF } from "@/lib/booth-handoff";
import { prepareBooth } from "@/server/booth";
import { asRecord, json, readBooth, readJson, readRescue, sealBooth, sealCamera, sealRescue, toErrorResponse } from "@/server/http";
import { ensureRestoredApproval } from "@/server/gate";
import { GATE_GUESS_DELAY_MS } from "@/server/gate-key";
import { normalizePin } from "@/server/pin";
import { claimRecovery, requestRecovery } from "@/server/profile-pin";
import { cameraProof } from "@/server/quota";
import { readOwnProfile } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rescueName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 24) return null;
  return name;
}

export async function GET(request: Request) {
  const booth = readBooth(request);
  try {
    const claimed = await claimRecovery(booth, readRescue(request));
    if (!claimed) return sealBooth(json({ error: "Ask with the profile name and PIN." }, 404), request, booth);
    if (claimed.status !== "accepted") {
      return sealBooth(json({ status: claimed.status, name: claimed.name }), request, booth);
    }
    const profile = await readOwnProfile(claimed.token);
    await ensureRestoredApproval(claimed.token, profile?.username ?? claimed.name);
    const response = sealCamera(
      json({
        status: "accepted",
        name: profile?.username || claimed.name,
        profile,
      }),
      request,
      claimed.token,
      await cameraProof(claimed.token),
    );
    return sealBooth(response, request, booth);
  } catch (error) {
    return sealBooth(toErrorResponse(error), request, booth);
  }
}

export async function POST(request: Request) {
  let booth = readBooth(request);
  try {
    const body = asRecord(await readJson(request));
    const pin = normalizePin(body.pin);
    const name = rescueName(body.name);
    if (!name) return sealBooth(json({ error: "Enter the profile name." }, 400), request, booth);
    if (!pin) return sealBooth(json({ error: "Enter the 6-digit PIN." }, 400), request, booth);
    const pass = await prepareBooth(booth);
    if (pass.shared) return sealBooth(json({ error: BOOTH_HANDOFF }, 409), request, pass.id);
    booth = pass.id;
    const result = await requestRecovery(booth, pin, name);
    if (!result.ok) {
      await delay(GATE_GUESS_DELAY_MS);
      const blocked = result.reason === "blocked";
      return sealBooth(
        json(
          { error: blocked ? "This phone needs a minute. Try again shortly." : "That name and PIN don't match a profile." },
          blocked ? 429 : 401,
        ),
        request,
        booth,
      );
    }
    const response = sealRescue(json({ status: result.status, name: result.name }), request, result.id);
    return sealBooth(response, request, booth);
  } catch (error) {
    return sealBooth(toErrorResponse(error), request, booth);
  }
}
