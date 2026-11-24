import { listFeed } from "@/server/store";
import { json, toErrorResponse } from "@/server/http";
import { optionalActor } from "@/server/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const photos = await listFeed(await optionalActor(request));
    return json({ photos });
  } catch (error) {
    return toErrorResponse(error);
  }
}
