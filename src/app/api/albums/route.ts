import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { requireMember } from "@/server/gate";
import { createAlbum, listAlbums } from "@/server/store";
import { cleanName, readProof } from "@/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireMember(request);
    return json({ albums: await listAlbums() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJson(request));
    const token = await requireMember(request);
    const album = await createAlbum(cleanName(body.name), token, readProof(request));
    return json(album, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
