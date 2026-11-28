import { json, asRecord, readJson, toErrorResponse, PHOTO_BODY_BYTES } from "@/server/http";
import { requireMember } from "@/server/gate";
import { createPhoto, wantsDevClock } from "@/server/store";
import { cleanCaption, cleanCapturedAt, optionalUuid, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request, PHOTO_BODY_BYTES));
    const token = await requireMember(request);
    const photo = await createPhoto({
      token,
      proof: readProof(request),
      caption: cleanCaption(body.caption),
      imageBase64: body.imageBase64,
      eventId: optionalUuid(body.eventId),
      albumId: optionalUuid(body.albumId),
      dev: wantsDevClock(request.headers.get("x-relapse-dev")),
      dateStamp: body.dateStamp === true,
      capturedAt: cleanCapturedAt(body.capturedAt),
    });
    return json(photo, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
