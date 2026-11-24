import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { createEvent, listEvents, wantsDevClock } from "@/server/store";
import { cleanHours, cleanName, isUuid, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function viewer(request: Request): string {
  const token = request.headers.get("x-shooter-token") ?? "";
  if (isUuid(token)) return token.toLowerCase();
  return "00000000-0000-4000-8000-000000000000";
}

export async function GET(request: Request) {
  try {
    return json({ events: await listEvents(viewer(request)) });
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
    );
    return json(event, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
