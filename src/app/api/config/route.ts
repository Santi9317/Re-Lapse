import { devClockEnabled } from "@/lib/clock";
import { json, toErrorResponse } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ devTimers: devClockEnabled() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
