import { json, toErrorResponse } from "@/server/http";
import { requireActor } from "@/server/quota";
import { listLab } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = await requireActor(request);
    const photos = await listLab(token);
    return json({ photos });
  } catch (error) {
    return toErrorResponse(error);
  }
}
