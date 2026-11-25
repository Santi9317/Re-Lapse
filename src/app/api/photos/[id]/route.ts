import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { deletePhoto, setCaption } from "@/server/store";
import { cleanCaption, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const body = asRecord(await readJson(request));
    const token = await requireMember(request);
    const result = await setCaption(photoId, token, cleanCaption(body.caption));
    return json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireMember(request);
    await deletePhoto(photoId, token);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
