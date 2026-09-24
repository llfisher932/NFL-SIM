import type { DuckDBConnection } from "@duckdb/node-api";
import type { z } from "zod";
import type { SeasonLoadCount, TableLoadReport } from "../types/data";
import { quoteIdent, quoteLiteral } from "./db";
import type { TableSpec } from "./tables";

export const REJECTS_TABLE = "ingest_rejects";
const DELETE_BATCH_SIZE = 5_000;

export interface RowReject<Id> {
  id: Id;
  key: string;
  reason: string;
}

export interface KeyedRow<Id> {
  id: Id;
  key: string;
  fields: Record<string, unknown>;
}

export function rejectReason(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.message))].join("; ");
}

export function findRejects<Id>(rows: readonly KeyedRow<Id>[], schema: z.ZodType): RowReject<Id>[] {
  return rows.flatMap((row) => {
    const result = schema.safeParse(row.fields);
    return result.success ? [] : [{ id: row.id, key: row.key, reason: rejectReason(result.error) }];
  });
}

export async function ensureRejectsTable(connection: DuckDBConnection): Promise<void> {
  await connection.run(
    `CREATE TABLE IF NOT EXISTS ${REJECTS_TABLE} (
       table_name VARCHAR, season INTEGER, row_key VARCHAR, reason VARCHAR)`,
  );
}

function assertSeasons(seasons: readonly number[]): void {
  if (seasons.length === 0 || !seasons.every(Number.isInteger)) {
    throw new Error(`invalid seasons: ${seasons.join(",")}`);
  }
}

async function missingColumns(
  connection: DuckDBConnection,
  table: string,
  expected: readonly string[],
): Promise<string[]> {
  const reader = await connection.runAndReadAll(`DESCRIBE ${quoteIdent(table)}`);
  const present = new Set(reader.getRowObjectsJS().map((row) => String(row["column_name"])));
  return expected.filter((column) => !present.has(column));
}

async function readSeasonRows(
  connection: DuckDBConnection,
  spec: TableSpec,
  columns: readonly string[],
  season: number | null,
): Promise<KeyedRow<bigint>[]> {
  const reader = await connection.runAndReadAll(
    `SELECT rowid AS _rowid, (${spec.keySql}) AS _key, ${columns.map(quoteIdent).join(", ")}
     FROM ${quoteIdent(spec.table)}${season === null ? "" : ` WHERE season = ${season}`}`,
  );
  return reader.getRowObjectsJS().map(({ _rowid, _key, ...fields }) => ({
    id: _rowid as bigint,
    key: String(_key),
    fields,
  }));
}

async function recordRejects(
  connection: DuckDBConnection,
  table: string,
  season: number | null,
  rejects: readonly RowReject<bigint>[],
): Promise<void> {
  if (rejects.length === 0) return;
  const appender = await connection.createAppender(REJECTS_TABLE);
  for (const reject of rejects) {
    appender.appendVarchar(table);
    if (season === null) appender.appendNull();
    else appender.appendInteger(season);
    appender.appendVarchar(reject.key);
    appender.appendVarchar(reject.reason);
    appender.endRow();
  }
  appender.closeSync();
}

async function deleteRows(
  connection: DuckDBConnection,
  table: string,
  ids: readonly bigint[],
): Promise<void> {
  for (let start = 0; start < ids.length; start += DELETE_BATCH_SIZE) {
    const batch = ids.slice(start, start + DELETE_BATCH_SIZE);
    await connection.run(`DELETE FROM ${quoteIdent(table)} WHERE rowid IN (${batch.join(", ")})`);
  }
}

export async function loadTable(
  connection: DuckDBConnection,
  spec: TableSpec,
  parquetPaths: readonly string[],
  seasons: readonly number[],
): Promise<TableLoadReport> {
  assertSeasons(seasons);
  const table = quoteIdent(spec.table);
  const files = parquetPaths.map((p) => quoteLiteral(p.replaceAll("\\", "/"))).join(", ");
  const columns = Object.keys(spec.schema.shape);
  const seasonal = spec.seasonal !== false;

  await ensureRejectsTable(connection);
  await connection.run("BEGIN TRANSACTION");
  try {
    await connection.run(
      `CREATE OR REPLACE TABLE ${table} AS
       SELECT * FROM read_parquet([${files}], union_by_name = true)
       ${seasonal ? `WHERE season IN (${seasons.join(", ")})` : ""}`,
    );
    const missing = await missingColumns(connection, spec.table, columns);
    if (missing.length > 0) throw new Error(`${spec.table}: missing columns ${missing.join(", ")}`);

    await connection.run(`DELETE FROM ${REJECTS_TABLE} WHERE table_name = ${quoteLiteral(spec.table)}`);
    const counts: SeasonLoadCount[] = [];
    const rejectReasons: Record<string, number> = {};
    const rejectedIds: bigint[] = [];

    for (const season of seasonal ? seasons : [null]) {
      const rows = await readSeasonRows(connection, spec, columns, season);
      const rejects = findRejects(rows, spec.schema);
      await recordRejects(connection, spec.table, season, rejects);
      for (const reject of rejects) {
        rejectedIds.push(reject.id);
        rejectReasons[reject.reason] = (rejectReasons[reject.reason] ?? 0) + 1;
      }
      counts.push({ season, loaded: rows.length - rejects.length, rejected: rejects.length });
    }

    await deleteRows(connection, spec.table, rejectedIds);
    await connection.run("COMMIT");
    return { table: spec.table, seasons: counts, rejectReasons };
  } catch (err) {
    await connection.run("ROLLBACK");
    throw err;
  }
}
