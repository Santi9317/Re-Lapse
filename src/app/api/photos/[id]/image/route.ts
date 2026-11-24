import { NextResponse } from "next/server";
import { toErrorResponse } from "@/server/http";
import { readImage } from "@/server/store";
import { isUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function viewer(request: Request): string | null {
  const header = request.headers.get("x-shooter-token");
  if (header && isUuid(header)) return header.toLowerCase();
  const token = new URL(request.url).searchParams.get("t");
  if (token && isUuid(token)) return token.toLowerCase();
  return null;
}

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return new NextResponse(null, { status: 404 });
    const image = await readImage(id.toLowerCase(), viewer(request));
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": image.visibility === "public" ? "public, max-age=86400" : "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
