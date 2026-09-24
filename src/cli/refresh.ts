import { parseArgs } from "node:util";
import { DownloadError } from "../data/cache";
import { DEFAULT_DASHBOARD_DIR } from "../data/dashboardStore";
import { DEFAULT_DB_PATH, DEFAULT_RAW_DIR, openDatabase } from "../data/db";
import { loadSeasonGames } from "../data/drives";
import { cacheRawFiles, loadTables } from "../data/ingest";
import { DEFAULT_OVERRIDES_PATH } from "../data/overrides";
import { weeksToRefresh } from "../dashboard/build";
import { DEFAULT_SEED, DEFAULT_SIMS } from "../sim/config";
import { cliErrorMessage, currentSeason, parseSeason, parseSeed, parseSims } from "./args";
import { exportWeeks } from "./exportRunner";

const FIRST_DATA_SEASON = 2021;

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    sims: { type: "string", default: String(DEFAULT_SIMS) },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    out: { type: "string", default: DEFAULT_DASHBOARD_DIR },
    overrides: { type: "string", default: DEFAULT_OVERRIDES_PATH },
    db: { type: "string", default: DEFAULT_DB_PATH },
    "raw-dir": { type: "string", default: DEFAULT_RAW_DIR },
  },
});

// Weekly refresh: re-download the current season, re-ingest, and export the latest and next weeks.
async function main(): Promise<void> {
  const season = values.season === undefined ? currentSeason(new Date()) : parseSeason(values.season);
  const seasons = Array.from({ length: season - FIRST_DATA_SEASON + 1 }, (_, i) => FIRST_DATA_SEASON + i);
  const started = new Date();
  console.log(`Refreshing ${season} (${started.toISOString()})`);

  const cached = await cacheRawFiles({
    seasons,
    rawDir: values["raw-dir"],
    refreshSeasons: [season],
    log: (line) => {
      if (line.startsWith("downloaded")) console.log(`  ${line}`);
    },
  });

  const db = await openDatabase(values.db);
  let weeks: number[];
  try {
    const reports = await loadTables(db.connection, cached, seasons);
    const rejected = reports.reduce((s, r) => s + r.seasons.reduce((t, x) => t + x.rejected, 0), 0);
    console.log(`  ingested ${reports.length} tables (${rejected} rows rejected)`);
    weeks = weeksToRefresh(await loadSeasonGames(db.connection, [season]), season);
  } finally {
    db.close();
  }
  if (weeks.length === 0) throw new Error(`no ${season} games scheduled`);

  console.log(`  exporting week(s) ${weeks.join(", ")}`);
  await exportWeeks({
    season,
    weeks,
    sims: parseSims(values.sims),
    seed: parseSeed(values.seed),
    out: values.out,
    overridesPath: values.overrides,
    injuries: true,
    dbPath: values.db,
    log: (line) => console.log(`  ${line.trim()}`),
  });
  console.log(`Done in ${((Date.now() - started.getTime()) / 1000).toFixed(0)}s`);
}

main().catch((err: unknown) => {
  if (err instanceof DownloadError) {
    console.error(`\nDownload failed, not retrying.\n  url:   ${err.url}\n  error: ${err.reason}`);
  } else {
    console.error(cliErrorMessage(err));
  }
  process.exitCode = 1;
});
