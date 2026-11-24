import { json, toErrorResponse } from "@/server/http";
import { optionalActor } from "@/server/quota";
import { getEvent } from "@/server/store";
import { requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const eventId = requireUuid(id, "That event is gone.");
    const viewer = await optionalActor(request);
    const event = await getEvent(eventId, viewer);
    if (!event) return json({ error: "That event is gone." }, 404);
    return json(event);
  } catch (error) {
    return toErrorResponse(error);
  }
}
