import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { setSticker } from "@/server/store";
import { cleanStickerEmoji, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = requireUuid(request.headers.get("x-shooter-token"), "This camera doesn't have an id yet.");
    const body = asRecord(await readJson(request));
    const stickers = await setSticker(photoId, token, cleanStickerEmoji(body.emoji));
    return json({ stickers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
