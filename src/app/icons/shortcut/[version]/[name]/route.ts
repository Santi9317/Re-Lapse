import { readFile } from "node:fs/promises";
import path from "node:path";
import { shortcutIconDestination } from "@/lib/home-icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ version: string; name: string }> };

/** Serves the shortcut icon bytes at this publish's URL. */
export async function GET(_request: Request, ctx: Ctx) {
  const { version, name } = await ctx.params;
  const destination = shortcutIconDestination(`/icons/shortcut/${version}/${name}`);
  if (!destination) return new Response(null, { status: 404 });
  const file = destination.slice("/icons/".length);
  const bytes = await readFile(path.join(process.cwd(), "public", "icons", file));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
