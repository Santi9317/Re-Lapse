import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { createEvent, listEvents, wantsDevClock } from "@/server/store";
import { cleanHours, cleanName, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return json({ events: await listEvents(await requireMember(request)) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request));
    const token = await requireMember(request);
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
