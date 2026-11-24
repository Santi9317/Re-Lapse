import { asRecord, json, readBooth, readJson, sealBooth, sealCamera, toErrorResponse } from "@/server/http";
import { ensureRestoredApproval } from "@/server/gate";
import { GATE_GUESS_DELAY_MS } from "@/server/gate-key";
import { normalizePin } from "@/server/pin";
import { takePinRestore } from "@/server/profile-pin";
import { cameraProof } from "@/server/quota";
import { readOwnProfile } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const booth = readBooth(request);
  try {
    const body = asRecord(await readJson(request));
    const pin = normalizePin(body.pin);
    if (!pin) return sealBooth(json({ error: "Enter the 6-digit PIN." }, 400), request, booth);
    const result = await takePinRestore(booth, pin);
    if (!result.ok) {
      await delay(GATE_GUESS_DELAY_MS);
      const blocked = result.reason === "blocked";
      return sealBooth(
        json(
          { error: blocked ? "The gate needs a minute. Try again shortly." : "That PIN doesn't match a profile." },
          blocked ? 429 : 401,
        ),
        request,
        booth,
      );
    }
    const profile = await readOwnProfile(result.token);
    if (!profile) {
      await delay(GATE_GUESS_DELAY_MS);
      return sealBooth(json({ error: "That PIN doesn't match a profile." }, 401), request, booth);
    }
    const membership = await ensureRestoredApproval(result.token, profile.username);
    const response = sealCamera(
      json({
        token: result.token,
        status: membership.status,
        name: profile.username,
        profile,
      }),
      request,
      result.token,
      await cameraProof(result.token),
    );
    return sealBooth(response, request, booth);
  } catch (error) {
    return sealBooth(toErrorResponse(error), request, booth);
  }
}
