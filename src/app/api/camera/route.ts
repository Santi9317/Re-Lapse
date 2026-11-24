import { json, toErrorResponse } from "@/server/http";
import { issueCamera } from "@/server/quota";
import { isUuid, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const header = request.headers.get("x-shooter-token");
    const presented = header && isUuid(header) ? header : null;
    const issued = await issueCamera(presented, readProof(request));
    return json(issued);
  } catch (error) {
    return toErrorResponse(error);
  }
}
