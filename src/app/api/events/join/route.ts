import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { joinEvent } from "@/server/store";
import { cleanInviteCode, readProof, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request));
    const token = requireUuid(request.headers.get("x-shooter-token"), "This camera doesn't have an id yet.");
    const event = await joinEvent(cleanInviteCode(body.code), token, readProof(request));
    return json(event);
  } catch (error) {
    return toErrorResponse(error);
  }
}
