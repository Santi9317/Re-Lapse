import { json, toErrorResponse } from "@/server/http";
import { issueCamera } from "@/server/quota";
import { isUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const header = request.headers.get("x-shooter-token");
    const presented = header && isUuid(header) ? header : null;
    const token = await issueCamera(presented);
    return json({ token });
  } catch (error) {
    return toErrorResponse(error);
  }
}
