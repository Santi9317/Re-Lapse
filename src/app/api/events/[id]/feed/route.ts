import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { publishEventFeed } from "@/server/store";
import { cleanPhotoIds, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = asRecord(await readJson(request));
    const token = requireUuid(request.headers.get("x-shooter-token"), "This camera doesn't have an id yet.");
    const event = await publishEventFeed(requireUuid(id, "That event is gone."), token, cleanPhotoIds(body.photoIds));
    return json(event);
  } catch (error) {
    return toErrorResponse(error);
  }
}
