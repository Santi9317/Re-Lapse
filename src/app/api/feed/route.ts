import { listFeed } from "@/server/store";
import { json, toErrorResponse } from "@/server/http";
import { isUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function viewer(request: Request): string {
  const token = request.headers.get("x-shooter-token") ?? "";
  if (isUuid(token)) return token.toLowerCase();
  return "00000000-0000-4000-8000-000000000000";
}

export async function GET(request: Request) {
  try {
    const photos = await listFeed(viewer(request));
    return json({ photos });
  } catch (error) {
    return toErrorResponse(error);
  }
}
