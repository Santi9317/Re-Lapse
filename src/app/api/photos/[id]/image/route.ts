import { NextResponse } from "next/server";
import { toErrorResponse } from "@/server/http";
import { viewerFromCookie } from "@/server/quota";
import { readImage } from "@/server/store";
import { isUuid, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function viewer(request: Request): Promise<string | null> {
  const header = request.headers.get("x-shooter-token");
  const headerToken = header && isUuid(header) ? header.toLowerCase() : null;
  const headerViewer = await viewerFromCookie(headerToken, readProof(request));
  if (headerViewer) return headerViewer;
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith("relapse_auth=")) continue;
    const value = decodeURIComponent(trimmed.slice("relapse_auth=".length));
    const dot = value.indexOf(".");
    if (dot < 0) continue;
    return viewerFromCookie(value.slice(0, dot), value.slice(dot + 1));
  }
  return null;
}

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return new NextResponse(null, { status: 404 });
    const image = await readImage(id.toLowerCase(), await viewer(request));
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": image.visibility === "public" ? "private, max-age=300" : "private, no-store",
        "content-disposition": 'inline; filename="Re-Lapse.jpg"',
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
