import { listFeed } from "@/server/store";
import { json, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const photos = await listFeed(await requireMember(request));
    return json({ photos });
  } catch (error) {
    return toErrorResponse(error);
  }
}
