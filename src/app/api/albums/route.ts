import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { createAlbum, listAlbums } from "@/server/store";
import { cleanName, readProof, requireUuid } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ albums: await listAlbums() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request));
    const token = requireUuid(request.headers.get("x-shooter-token"), "This camera doesn't have an id yet.");
    const album = await createAlbum(cleanName(body.name), token, readProof(request));
    return json(album, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
