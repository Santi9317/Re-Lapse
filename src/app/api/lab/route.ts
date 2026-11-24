import { json, toErrorResponse } from "@/server/http";
import { listLab } from "@/server/store";
import { isUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = request.headers.get("x-shooter-token") ?? "";
    if (!isUuid(token)) return json({ photos: [] });
    const photos = await listLab(token.toLowerCase());
    return json({ photos });
  } catch (error) {
    return toErrorResponse(error);
  }
}
