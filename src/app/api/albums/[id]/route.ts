import { json, toErrorResponse } from "@/server/http";
import { getAlbum } from "@/server/store";
import { isUuid, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const albumId = requireUuid(id, "That roll is gone.");
    const token = request.headers.get("x-shooter-token") ?? "";
    const viewer = isUuid(token) ? token.toLowerCase() : "00000000-0000-4000-8000-000000000000";
    const found = await getAlbum(albumId, viewer);
    if (!found) return json({ error: "That roll is gone." }, 404);
    return json(found);
  } catch (error) {
    return toErrorResponse(error);
  }
}
