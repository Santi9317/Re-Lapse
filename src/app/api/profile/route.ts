import { asRecord, HttpError, json, PHOTO_BODY_BYTES, readJson, toErrorResponse } from "@/server/http";
import { readOwnProfile, saveOwnProfile } from "@/server/store";
import { cleanProfileWrite, readProof, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shooter(request: Request): string {
  return requireUuid(request.headers.get("x-shooter-token") ?? "", "This camera doesn't have an id yet.");
}

export async function GET(request: Request) {
  try {
    const profile = await readOwnProfile(shooter(request));
    if (!profile) throw new HttpError(404, "No profile yet.");
    return json(profile);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = asRecord(await readJson(request, PHOTO_BODY_BYTES));
    const profile = await saveOwnProfile(shooter(request), cleanProfileWrite(body), readProof(request));
    return json(profile);
  } catch (error) {
    return toErrorResponse(error);
  }
}
