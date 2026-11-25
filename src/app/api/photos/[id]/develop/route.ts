import { asRecord, json, PHOTO_BODY_BYTES, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { developPhoto } from "@/server/store";
import { cleanChemistry, requireUuid } from "@/server/validate";
import type { Chemistry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const photoId = requireUuid(id, "That frame is gone.");
    const token = await requireMember(request);
    const type = request.headers.get("content-type") ?? "";
    let print: { imageBase64: string; chemistry: Chemistry } | null = null;
    if (type.includes("application/json")) {
      const body = asRecord(await readJson(request, PHOTO_BODY_BYTES));
      if (typeof body.imageBase64 === "string" && body.imageBase64.length > 0) {
        print = {
          imageBase64: body.imageBase64,
          chemistry: cleanChemistry(body.chemistry) ?? "default",
        };
      }
    }
    const result = await developPhoto(photoId, token, print);
    return json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
