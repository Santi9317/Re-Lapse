import { json, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { publishPhoto } from "@/server/store";
import { requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireMember(request);
    const result = await publishPhoto(photoId, token);
    return json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
