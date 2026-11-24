import { asRecord, json, readJson, sealCamera, toErrorResponse } from "@/server/http";
import { askToJoin, readMembership } from "@/server/gate";
import { cleanName } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const membership = await readMembership(request);
    if (!membership) return json({ error: "Ask with a name." }, 404);
    return json({ status: membership.status, name: membership.name });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request));
    const membership = await askToJoin(request, cleanName(body.name));
    return sealCamera(
      json({
        status: membership.status,
        name: membership.name,
        token: membership.token,
        proof: membership.proof,
      }),
      request,
      membership.token,
      membership.proof,
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
