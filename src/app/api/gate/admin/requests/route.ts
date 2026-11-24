import { json, toErrorResponse } from "@/server/http";
import { assertGate, listPending } from "@/server/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertGate(request);
    return json({ requests: await listPending() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
