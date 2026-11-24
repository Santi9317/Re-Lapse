import { json, readBooth, sealBooth, sealCamera, toErrorResponse } from "@/server/http";
import { issueCamera } from "@/server/quota";
import { isUuid, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const booth = readBooth(request);
  try {
    const header = request.headers.get("x-shooter-token");
    const presented = header && isUuid(header) ? header : null;
    const issued = await issueCamera(presented, readProof(request), booth);
    const response = sealCamera(json({ token: issued.token }), request, issued.token, issued.proof);
    return sealBooth(response, request, booth);
  } catch (error) {
    return sealBooth(toErrorResponse(error), request, booth);
  }
}
