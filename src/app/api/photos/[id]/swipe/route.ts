import { HttpError, asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { captionPostedPhoto, discardPhoto, publishPhoto, restorePhoto, unpublishPhoto } from "@/server/store";
import { cleanCaption, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const OPS = new Set(["pass", "feed", "undo-pass", "undo-feed", "caption"]);

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const body = asRecord(await readJson(request));
    const op = body.op;
    if (typeof op !== "string" || !OPS.has(op)) throw new HttpError(400, "The lab couldn't read that.");
    const token = await requireMember(request);
    if (op === "pass") {
      await discardPhoto(photoId, token);
      return json({ ok: true });
    }
    if (op === "feed") return json(await publishPhoto(photoId, token));
    if (op === "undo-pass") {
      await restorePhoto(photoId, token);
      return json({ ok: true });
    }
    if (op === "undo-feed") {
      await unpublishPhoto(photoId, token);
      return json({ ok: true });
    }
    return json(await captionPostedPhoto(photoId, token, cleanCaption(body.caption)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
