import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { setSticker } from "@/server/store";
import { cleanStickerEmoji, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireMember(request);
    const body = asRecord(await readJson(request));
    const stickers = await setSticker(photoId, token, cleanStickerEmoji(body.emoji));
    return json({ stickers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
