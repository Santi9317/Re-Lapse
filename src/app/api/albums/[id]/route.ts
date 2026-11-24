import { json, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { getAlbum } from "@/server/store";
import { requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const albumId = requireUuid(id, "That roll is gone.");
    const viewer = await requireMember(request);
    const found = await getAlbum(albumId, viewer);
    if (!found) return json({ error: "That roll is gone." }, 404);
    return json(found);
  } catch (error) {
    return toErrorResponse(error);
  }
}
