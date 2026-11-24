import { json, toErrorResponse } from "@/server/http";
import { requireActor } from "@/server/quota";
import { deletePhoto } from "@/server/store";
import { requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireActor(request);
    await deletePhoto(photoId, token);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
