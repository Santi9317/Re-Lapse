import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(process.cwd(), "src", specifier.slice(2));
    const file = existsSync(`${base}.ts`) ? `${base}.ts` : base;
    return nextResolve(pathToFileURL(file).href, context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const hinted = message.match(/Did you mean to import "([^"]+)"/);
    if (!hinted) throw error;
    return nextResolve(hinted[1], context);
  }
}
