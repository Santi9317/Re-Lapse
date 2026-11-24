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
    const response = json(issued);
    const secure = new URL(request.url).protocol === "https:";
    response.cookies.set("relapse_auth", `${issued.token}.${issued.proof}`, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 31_536_000,
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
