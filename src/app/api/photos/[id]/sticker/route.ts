import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { moveSticker, removeSticker, setSticker } from "@/server/store";
import { cleanStickerEmoji, cleanStickerPoint, requireUuid } from "@/server/validate";

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

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireMember(request);
    const body = asRecord(await readJson(request));
    const point = cleanStickerPoint(body.x, body.y);
    const stickers = await moveSticker(photoId, token, requireUuid(body.id, "That sticker is gone."), point.x, point.y);
    return json({ stickers });
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
    const stickers = await removeSticker(photoId, token, requireUuid(body.id, "That sticker is gone."));
    return json({ stickers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
