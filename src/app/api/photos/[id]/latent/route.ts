import { NextResponse } from "next/server";
import { toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { readLatent } from "@/server/store";
import { isUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return new NextResponse(null, { status: 404 });
    const token = await requireMember(request);
    const bytes = await readLatent(id.toLowerCase(), token);
    if (!bytes) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, no-store",
        "content-disposition": 'inline; filename="Re-Lapse.jpg"',
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
