import { asRecord, HttpError, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { chooseChemistry } from "@/server/store";
import { cleanChemistry, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireMember(request);
    const body = asRecord(await readJson(request));
    const chemistry = cleanChemistry(body.chemistry);
    if (!chemistry) throw new HttpError(400, "That bath isn't one of ours.");
    return json(await chooseChemistry(photoId, token, chemistry));
  } catch (error) {
    return toErrorResponse(error);
  }
}
