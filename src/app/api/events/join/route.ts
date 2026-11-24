import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { joinEvent } from "@/server/store";
import { cleanInviteCode, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request));
    const token = await requireMember(request);
    const event = await joinEvent(cleanInviteCode(body.code), token, readProof(request));
    return json(event);
  } catch (error) {
    return toErrorResponse(error);
  }
}
