import { json, toErrorResponse } from "@/server/http";
import { assertGate, listPending } from "@/server/gate";
import { listRecoveryRequests } from "@/server/profile-pin";
import { listActiveProfiles } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertGate(request);
    return json({
      requests: await listPending(),
      recoveries: await listRecoveryRequests(),
      profiles: await listActiveProfiles(),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
