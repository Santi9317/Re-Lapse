import { asRecord, json, readJson, toErrorResponse } from "@/server/http";
import { createAlbum, listAlbums } from "@/server/store";
import { cleanName } from "@/server/validate";

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
    const album = await createAlbum(cleanName(body.name));
    return json(album, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
