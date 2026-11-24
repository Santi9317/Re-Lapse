import { json, toErrorResponse } from "@/server/http";
import { assertGate, listPending } from "@/server/gate";
import { listRecoveryRequests } from "@/server/profile-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertGate(request);
    return json({ requests: await listPending(), recoveries: await listRecoveryRequests() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
