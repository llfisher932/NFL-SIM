import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export const DEFAULT_DB_PATH = "data/nfl.duckdb";
export const DEFAULT_RAW_DIR = "data/raw";

export interface Database {
  connection: DuckDBConnection;
  close(): void;
}

export async function openDatabase(path: string = DEFAULT_DB_PATH, options: { readOnly?: boolean } = {}): Promise<Database> {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const instance = await DuckDBInstance.create(path, options.readOnly ? { access_mode: "READ_ONLY" } : {});
  const connection = await instance.connect();
  return {
    connection,
    close() {
      connection.closeSync();
      instance.closeSync();
    },
  };
}

export const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;
export const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
