import { HttpError, json, toErrorResponse } from "@/server/http";
import { assertGate } from "@/server/gate";
import { readPublicProfile, removeProfile } from "@/server/store";
import { isUuid, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    assertGate(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(404, "That profile is gone.");
    const profile = await readPublicProfile(id.toLowerCase());
    if (!profile) throw new HttpError(404, "That profile is gone.");
    return json(profile);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    assertGate(request);
    const { id } = await ctx.params;
    const profileId = requireUuid(id, "That profile is gone.");
    const removed = await removeProfile(profileId);
    if (!removed) throw new HttpError(404, "That profile is gone.");
    return json({ id: profileId, removed: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
