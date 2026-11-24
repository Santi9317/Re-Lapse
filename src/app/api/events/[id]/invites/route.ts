import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { inviteToEvent } from "@/server/store";
import { cleanInviteName, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = asRecord(await readJson(request));
    const token = await requireMember(request);
    const event = await inviteToEvent(requireUuid(id, "That timecapsule is gone."), token, cleanInviteName(body.username));
    return json(event);
  } catch (error) {
    return toErrorResponse(error);
  }
}
