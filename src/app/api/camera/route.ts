import { BOOTH_HANDOFF } from "@/lib/booth-handoff";
import { prepareBooth } from "@/server/booth";
import { json, readBooth, sealBooth, sealCamera, toErrorResponse } from "@/server/http";
import { cameraRenewal } from "@/server/camera-renew";
import { cameraProof, issueCamera, provenCamera } from "@/server/quota";
import { isUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let booth = readBooth(request);
  try {
    const header = request.headers.get("x-shooter-token");
    const headerToken = Boolean(header && isUuid(header));
    const known = await provenCamera(request);
    const choice = cameraRenewal({ cookie: Boolean(known), headerToken });
    if (choice === "keep" && known) {
      const response = sealCamera(json({ token: known }), request, known, await cameraProof(known));
      return sealBooth(response, request, booth);
    }
    if (choice === "hold") {
      return sealBooth(json({ error: "This phone still has its camera." }, 401), request, booth);
    }
    const pass = await prepareBooth(booth);
    if (pass.shared) return sealBooth(json({ error: BOOTH_HANDOFF }, 409), request, pass.id);
    booth = pass.id;
    const issued = await issueCamera(null, null, booth);
    const response = sealCamera(json({ token: issued.token }), request, issued.token, issued.proof);
    return sealBooth(response, request, booth);
  } catch (error) {
    return sealBooth(toErrorResponse(error), request, booth);
  }
}
