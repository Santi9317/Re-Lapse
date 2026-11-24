import { asRecord, HttpError, json, PHOTO_BODY_BYTES, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { readOwnProfile, saveOwnProfile } from "@/server/store";
import { cleanProfileWrite, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shooter(request: Request): Promise<string> {
  return requireMember(request);
}

export async function GET(request: Request) {
  try {
    const profile = await readOwnProfile(await shooter(request));
    if (!profile) throw new HttpError(404, "No profile yet.");
    return json(profile);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = asRecord(await readJson(request, PHOTO_BODY_BYTES));
    const saved = await saveOwnProfile(await shooter(request), cleanProfileWrite(body), readProof(request));
    return json(saved);
  } catch (error) {
    return toErrorResponse(error);
  }
}
