import { HttpError, json, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { readPublicProfile } from "@/server/store";
import { isUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    await requireMember(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(404, "That profile is gone.");
    const profile = await readPublicProfile(id.toLowerCase());
    if (!profile) throw new HttpError(404, "That profile is gone.");
    return json(profile);
  } catch (error) {
    return toErrorResponse(error);
  }
}
