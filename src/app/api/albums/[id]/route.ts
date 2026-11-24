import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { deleteAlbum, getAlbum, updateAlbum } from "@/server/store";
import { readGalleryPatch, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const albumId = requireUuid(id, "That gallery is gone.");
    const viewer = await requireMember(request);
    const found = await getAlbum(albumId, viewer);
    if (!found) return json({ error: "That gallery is gone." }, 404);
    return json(found);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const albumId = requireUuid(id, "That gallery is gone.");
    const token = await requireMember(request);
    const album = await updateAlbum(albumId, token, readGalleryPatch(asRecord(await readJson(request))));
    return json(album);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const albumId = requireUuid(id, "That gallery is gone.");
    const token = await requireMember(request);
    await deleteAlbum(albumId, token);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
