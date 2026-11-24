import { asRecord, json, readBooth, readJson, sealBooth, sealCamera, toErrorResponse } from "@/server/http";
import { askToJoin, readMembership } from "@/server/gate";
import { cameraProof, provenCamera } from "@/server/quota";
import { cleanName } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const booth = readBooth(request);
  try {
    const membership = await readMembership(request);
    if (!membership) return sealBooth(json({ error: "Ask with a name." }, 404), request, booth);
    const token = await provenCamera(request);
    if (!token) return sealBooth(json({ error: "Ask with a name." }, 404), request, booth);
    const response = sealCamera(
      json({ status: membership.status, name: membership.name }),
      request,
      token,
      await cameraProof(token),
    );
    return sealBooth(response, request, booth);
  } catch (error) {
    return sealBooth(toErrorResponse(error), request, booth);
  }
}

export async function POST(request: Request) {
  const booth = readBooth(request);
  try {
    const body = asRecord(await readJson(request));
    const membership = await askToJoin(request, cleanName(body.name), booth);
    const response = sealCamera(
      json({
        status: membership.status,
        name: membership.name,
        token: membership.token,
      }),
      request,
      membership.token,
      membership.proof,
    );
    return sealBooth(response, request, booth);
  } catch (error) {
    return sealBooth(toErrorResponse(error), request, booth);
  }
}
