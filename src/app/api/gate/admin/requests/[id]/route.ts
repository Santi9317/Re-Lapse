import { asRecord, HttpError, json, readJson, toErrorResponse } from "@/server/http";
import { assertGate, decideRequest } from "@/server/gate";
import { requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    assertGate(request);
    const { id } = await ctx.params;
    const body = asRecord(await readJson(request));
    const decision = body.decision;
    if (decision !== "accepted" && decision !== "declined") {
      throw new HttpError(400, "Say whether this camera comes in.");
    }
    await decideRequest(requireUuid(id, "That request is already settled."), decision);
    return json({ id: id.toLowerCase(), status: decision });
  } catch (error) {
    return toErrorResponse(error);
  }
}
