import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { filePhoto } from "@/server/store";
import { optionalUuid, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const body = asRecord(await readJson(request));
    const token = await requireMember(request);
    await filePhoto(photoId, token, optionalUuid(body.albumId));
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
