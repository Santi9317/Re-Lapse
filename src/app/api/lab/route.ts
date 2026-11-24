import { json, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { listLab } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = await requireMember(request);
    const photos = await listLab(token);
    return json({ photos });
  } catch (error) {
    return toErrorResponse(error);
  }
}
