import { json, asRecord, readJson, toErrorResponse, PHOTO_BODY_BYTES } from "@/server/http";
import { createPhoto, wantsDevClock } from "@/server/store";
import { cleanCaption, optionalUuid, readProof, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request, PHOTO_BODY_BYTES));
    const header = request.headers.get("x-shooter-token");
    const token = requireUuid(header || body.shooterToken, "This camera doesn't have an id yet.");
    const photo = await createPhoto({
      token,
      proof: readProof(request),
      caption: cleanCaption(body.caption),
      imageBase64: body.imageBase64,
      eventId: optionalUuid(body.eventId),
      dev: wantsDevClock(request.headers.get("x-relapse-dev")),
    });
    return json(photo, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
