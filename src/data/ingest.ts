import type { DuckDBConnection } from "@duckdb/node-api";
import type { CachedFile, RawFile, TableLoadReport } from "../types/data";
import { ensureCached } from "./cache";
import { loadTable } from "./load";
import { rawFilesFor } from "./sources";
import { TABLE_SPECS } from "./tables";

export interface IngestOptions {
  seasons: readonly number[];
  rawDir: string;
  force?: boolean;
  // Re-download only these seasons' files plus the all-season files; everything else stays cached.
  refreshSeasons?: readonly number[];
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export function shouldRefresh(file: RawFile, refreshSeasons: readonly number[]): boolean {
  if (refreshSeasons.length === 0) return false;
  return file.season === null || refreshSeasons.includes(file.season);
}

export async function cacheRawFiles(options: IngestOptions): Promise<CachedFile[]> {
  const log = options.log ?? (() => {});
  const cached: CachedFile[] = [];
  for (const file of rawFilesFor(options.seasons)) {
    const force = options.force === true || shouldRefresh(file, options.refreshSeasons ?? []);
    const result = await ensureCached(file, {
      rawDir: options.rawDir,
      force,
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
