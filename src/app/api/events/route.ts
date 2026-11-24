import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { createEvent, listEvents, wantsDevClock } from "@/server/store";
import { cleanHours, cleanName } from "@/server/validate";

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
    const event = await createEvent(
      cleanName(body.name),
      cleanHours(body.durationHours),
      wantsDevClock(request.headers.get("x-relapse-dev")),
    );
    return json(event, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
