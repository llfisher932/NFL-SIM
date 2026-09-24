import type { DuckDBConnection } from "@duckdb/node-api";
import type { CachedFile, TableLoadReport } from "../types/data";
import { ensureCached } from "./cache";
import { loadTable } from "./load";
import { rawFilesFor } from "./sources";
import { TABLE_SPECS } from "./tables";

export interface IngestOptions {
  seasons: readonly number[];
  rawDir: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export async function cacheRawFiles(options: IngestOptions): Promise<CachedFile[]> {
  const log = options.log ?? (() => {});
  const cached: CachedFile[] = [];
  for (const file of rawFilesFor(options.seasons)) {
    const result = await ensureCached(file, {
      rawDir: options.rawDir,
      ...(options.force !== undefined && { force: options.force }),
      ...(options.fetchImpl !== undefined && { fetchImpl: options.fetchImpl }),
    });
    log(`${result.status.padEnd(10)} ${file.relativePath}`);
    cached.push(result);
  }
  return cached;
}

export async function loadTables(
  connection: DuckDBConnection,
  cached: readonly CachedFile[],
  seasons: readonly number[],
): Promise<TableLoadReport[]> {
  const reports: TableLoadReport[] = [];
  for (const spec of TABLE_SPECS) {
    const paths = cached.filter((c) => c.file.dataset === spec.dataset).map((c) => c.path);
    reports.push(await loadTable(connection, spec, paths, seasons));
  }
  return reports;
}
