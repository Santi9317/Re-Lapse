import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

type GlobalDb = {
  pool?: pg.Pool;
  local?: Promise<PGlite>;
};

const globalForDb = globalThis as typeof globalThis & { __relapseDb?: GlobalDb };
globalForDb.__relapseDb ??= {};

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") {
    globalForDb.__relapseDb!.pool ??= new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
    });
    return (await globalForDb.__relapseDb!.pool.query(text, params)).rows as T[];
  }
  globalForDb.__relapseDb!.local ??= startLocal().catch((error: unknown) => {
    globalForDb.__relapseDb!.local = undefined;
    throw error;
  });
  return (await (await globalForDb.__relapseDb!.local).query<T>(text, params)).rows;
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const dir = path.join(process.cwd(), "migrations");
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(path.join(dir, file), "utf8"));
  }
  return db;
}
