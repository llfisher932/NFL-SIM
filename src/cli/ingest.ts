import { parseArgs } from "node:util";
import { DownloadError } from "../data/cache";
import { DEFAULT_DB_PATH, DEFAULT_RAW_DIR, openDatabase } from "../data/db";
import { cacheRawFiles, loadTables } from "../data/ingest";
import { REJECTS_TABLE } from "../data/load";
import { teamEpaPerPlay } from "../data/queries";
import type { TableLoadReport } from "../types/data";
import { cliErrorMessage, parseSeasons } from "./args";
import { fixed, formatTable } from "./format";

const { values } = parseArgs({
  options: {
    seasons: { type: "string", default: "2021-2025" },
    force: { type: "boolean", default: false },
    db: { type: "string", default: DEFAULT_DB_PATH },
    "raw-dir": { type: "string", default: DEFAULT_RAW_DIR },
  },
});

function printLoadReports(reports: readonly TableLoadReport[]): void {
  const rows = reports.flatMap((r) =>
    r.seasons.map((s) => [r.table, s.season ?? "all", s.loaded.toLocaleString("en-US"), s.rejected]),
  );
  console.log(`\n${formatTable(["table", "season", "rows", "rejected"], rows)}`);

  const reasons = reports.flatMap((r) =>
    Object.entries(r.rejectReasons).map(([reason, n]) => [r.table, reason, n] as [string, string, number]),
  );
  if (reasons.length > 0) {
    console.log(`\nRejected rows by reason (details in ${REJECTS_TABLE}):`);
    console.log(formatTable(["table", "reason", "count"], reasons));
  }
}

async function main(): Promise<void> {
  const seasons = parseSeasons(values.seasons);
  console.log(`Seasons: ${seasons.join(", ")}${values.force ? " (forced re-download)" : ""}`);

  const cached = await cacheRawFiles({
    seasons,
    rawDir: values["raw-dir"],
    force: values.force,
    log: (line) => console.log(`  ${line}`),
  });

  const db = await openDatabase(values.db);
  try {
    const reports = await loadTables(db.connection, cached, seasons);
    printLoadReports(reports);

    const sampleSeason = seasons[seasons.length - 1] ?? 0;
    const epa = await teamEpaPerPlay(db.connection, sampleSeason, 1);
    console.log(`\nSample: team EPA/play, ${sampleSeason} week 1 (pass + rush plays)`);
    console.log(
      formatTable(
        ["team", "off plays", "off EPA/play", "def plays", "def EPA/play"],
        epa.map((t) => [t.team, t.offPlays, fixed(t.offEpaPerPlay), t.defPlays, fixed(t.defEpaPerPlay)]),
      ),
    );
    console.log(`\nDatabase: ${values.db}`);
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  if (err instanceof DownloadError) {
    console.error(`\nDownload failed — not retrying.\n  url:   ${err.url}\n  error: ${err.reason}`);
  } else {
    console.error(cliErrorMessage(err));
  }
  process.exitCode = 1;
});
