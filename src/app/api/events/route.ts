import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { optionalActor } from "@/server/quota";
import { createEvent, listEvents, wantsDevClock } from "@/server/store";
import { cleanHours, cleanName, readProof, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return json({ events: await listEvents(await optionalActor(request)) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request));
    const token = requireUuid(request.headers.get("x-shooter-token"), "This camera doesn't have an id yet.");
    const event = await createEvent(
      cleanName(body.name),
      cleanHours(body.durationHours),
      wantsDevClock(request.headers.get("x-relapse-dev")),
      token,
      readProof(request),
    );
    return json(event, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
