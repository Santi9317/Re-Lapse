import { json, readBooth, sealBooth, sealCamera, toErrorResponse } from "@/server/http";
import { issueCamera } from "@/server/quota";
import { isUuid, readCameraAuth } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const booth = readBooth(request);
  try {
    const auth = readCameraAuth(request);
    const header = request.headers.get("x-shooter-token");
    const headerToken = header && isUuid(header) ? header.toLowerCase() : null;
    const presented = auth?.token ?? headerToken;
    const proof = auth && presented === auth.token ? auth.proof : null;
    const issued = await issueCamera(presented, proof, booth);
    const response = sealCamera(json({ token: issued.token }), request, issued.token, issued.proof);
    return sealBooth(response, request, booth);
  } catch (error) {
    return sealBooth(toErrorResponse(error), request, booth);
  }
}
