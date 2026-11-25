import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { removeFrameNote, setFrameNote } from "@/server/store";
import { cleanFrameNote, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireMember(request);
    const body = asRecord(await readJson(request));
    const comments = await setFrameNote(photoId, token, cleanFrameNote(body.text));
    return json({ comments });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireMember(request);
    const body = asRecord(await readJson(request));
    const comments = await removeFrameNote(photoId, token, requireUuid(body.id, "That note is gone."));
    return json({ comments });
  } catch (error) {
    return toErrorResponse(error);
  }
}
