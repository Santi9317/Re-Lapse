import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireActor } from "@/server/quota";
import { publishEventFeed } from "@/server/store";
import { cleanPhotoIds, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = asRecord(await readJson(request));
    const token = await requireActor(request);
    const event = await publishEventFeed(requireUuid(id, "That event is gone."), token, cleanPhotoIds(body.photoIds));
    return json(event);
  } catch (error) {
    return toErrorResponse(error);
  }
}
