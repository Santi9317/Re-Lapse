import { asRecord, HttpError, json, PHOTO_BODY_BYTES, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { profileWasRemoved, readOwnProfile, saveOwnProfile } from "@/server/store";
import { cleanProfileWrite, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shooter(request: Request): Promise<string> {
  return requireMember(request);
}

export async function GET(request: Request) {
  try {
    const token = await shooter(request);
    const profile = await readOwnProfile(token);
    if (profile) return json(profile);
    if (await profileWasRemoved(token)) return json({ removed: true, error: "That profile is gone." }, 410);
    throw new HttpError(404, "No profile yet.");
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = asRecord(await readJson(request, PHOTO_BODY_BYTES));
    const replaceRemoved = request.headers.get("x-relapse-replace-profile") === "1";
    const saved = await saveOwnProfile(
      await shooter(request),
      cleanProfileWrite(body),
      readProof(request),
      replaceRemoved,
    );
    return json(saved);
  } catch (error) {
    return toErrorResponse(error);
  }
}
