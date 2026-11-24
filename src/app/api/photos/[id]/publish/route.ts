import { json, toErrorResponse } from "@/server/http";
import { publishPhoto } from "@/server/store";
import { requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = requireUuid(request.headers.get("x-shooter-token"), "This camera doesn't have an id yet.");
    const result = await publishPhoto(photoId, token);
    return json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
