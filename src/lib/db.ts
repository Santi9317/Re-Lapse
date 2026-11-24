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

export type Sql = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

function pool(): pg.Pool {
  globalForDb.__relapseDb!.pool ??= new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
  });
  return globalForDb.__relapseDb!.pool!;
}

async function localDb(): Promise<PGlite> {
  globalForDb.__relapseDb!.local ??= startLocal().catch((error: unknown) => {
    globalForDb.__relapseDb!.local = undefined;
    throw error;
  });
  return globalForDb.__relapseDb!.local!;
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") return (await pool().query(text, params)).rows as T[];
  return (await (await localDb()).query<T>(text, params)).rows;
}

/** Runs the callback on one connection, so a row lock covers every statement inside. */
export async function withTransaction<T>(fn: (q: Sql) => Promise<T>): Promise<T> {
  if (databaseUrl !== "") {
    const client = await pool().connect();
    const q: Sql = async (text, params = []) => (await client.query(text, params)).rows as never[];
    try {
      await client.query("begin");
      const value = await fn(q);
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  const db = await localDb();
  return db.transaction(async (tx) => {
    const q: Sql = async (text, params = []) => (await tx.query(text, params)).rows as never[];
    return fn(q);
  });
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
