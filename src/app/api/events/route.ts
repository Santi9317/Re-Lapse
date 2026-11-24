import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { clientSource } from "@/server/quota";
import { createEvent, listEvents, wantsDevClock } from "@/server/store";
import { cleanHours, cleanName, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ events: await listEvents() });
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
      clientSource(request),
    );
    return json(event, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
