import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { availableParallelism, freemem, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { BACKTEST_TABLE, writeBacktestPredictions } from "../data/backtestStore";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { loadConversionCounts, loadDrives, loadSeasonGames } from "../data/drives";
import { loadTeamGames } from "../data/teamGames";
import { runBacktest, splitSeasons, type BacktestInputs } from "../eval/backtest";
import { calibrationReport, compareToMarket } from "../eval/report";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { FIRST_DATA_SEASON } from "../features/league";
import { DEFAULT_SEED, DEFAULT_SIM_CONFIG } from "../sim/config";
import type { BacktestPrediction, CalibrationBucket, HitRate, ScoreCard } from "../types/eval";
import { cliErrorMessage, parseHalfLife, parseHfa, parseSeasons, parseSeed, parseSims } from "./args";
import { loadInjuryInputs } from "./injuryContext";
import { fixed, formatTable, type Cell } from "./format";

const DEFAULT_BACKTEST_SIMS = 2000;
// Each worker loads its own copy of the data (about 1.3 GB with 2012+ history), plus headroom.
const WORKER_MEMORY_BYTES = 1.75 * 2 ** 30;
const MAX_WORKERS = 8;

const allSeasonsThrough = (seasons: readonly number[]) =>
  Array.from({ length: Math.max(...seasons) - FIRST_DATA_SEASON + 1 }, (_, i) => FIRST_DATA_SEASON + i);

const { values } = parseArgs({
  options: {
    seasons: { type: "string", default: "2015-2025" },
    sims: { type: "string", default: String(DEFAULT_BACKTEST_SIMS) },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    "hfa-epa": { type: "string", default: String(DEFAULT_SIM_CONFIG.homeFieldEpa) },
    "half-life": { type: "string", default: String(DEFAULT_FEATURE_CONFIG.halfLifeWeeks) },
    "no-injuries": { type: "boolean", default: false },
    workers: { type: "string" },
    "shard-out": { type: "string" },
    db: { type: "string", default: DEFAULT_DB_PATH },
  },
});

const percent = (rate: HitRate) =>
  rate.decisions === 0 ? "" : `${fixed((100 * rate.hits) / rate.decisions, 1)}%`;

function pair(model: ScoreCard, market: ScoreCard, key: keyof ScoreCard, digits: number): Cell[] {
  return [fixed(model[key], digits), fixed(market[key], digits)];
}

function calibrationRows(model: CalibrationBucket[], market: CalibrationBucket[]): Cell[][] {
  const pct = (v: number) => (Number.isNaN(v) ? "" : fixed(100 * v, 1));
  return model.map((m, i) => {
    const k = market[i]!;
    return [
      `${fixed(100 * m.lower, 0)}-${fixed(100 * m.upper, 0)}%`,
      m.games,
      pct(m.meanPredicted),
      pct(m.actualRate),
      k.games,
      pct(k.meanPredicted),
      pct(k.actualRate),
    ];
  });
}

async function loadInputs(seasons: readonly number[], readOnly: boolean): Promise<BacktestInputs> {
  const db = await openDatabase(values.db, { readOnly });
  try {
    return {
      teamGames: await loadTeamGames(db.connection),
      drives: await loadDrives(db.connection),
      conversions: await loadConversionCounts(db.connection),
      games: await loadSeasonGames(db.connection, allSeasonsThrough(seasons)),
      injuries: await loadInjuryInputs(db.connection, !values["no-injuries"]),
    };
  } finally {
    db.close();
  }
}

function workerCount(seasons: readonly number[]): number {
  if (values.workers !== undefined) {
    const n = Number(values.workers);
    if (!Number.isInteger(n) || n < 1 || n > 32) throw new Error("invalid workers");
    return n;
  }
  return Math.max(1, Math.min(seasons.length, availableParallelism() - 2, Math.floor(freemem() / WORKER_MEMORY_BYTES), MAX_WORKERS));
}

// Runs each shard of seasons in its own process (each reads the database read-only) and merges
// their predictions. Results match a single process because every season only looks backward.
async function runInWorkers(shards: number[][], passThrough: string[]): Promise<BacktestPrediction[]> {
  const dir = await mkdtemp(join(tmpdir(), "gridiron-backtest-"));
  const started = Date.now();
  try {
    const files = await Promise.all(
      shards.map(
        (shard, i) =>
          new Promise<string>((resolve, reject) => {
            const out = join(dir, `shard-${i}.json`);
            const args = [...process.execArgv, fileURLToPath(import.meta.url), "--seasons", shard.join(","), "--shard-out", out, ...passThrough];
            const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] });
            child.on("error", reject);
            child.on("exit", (code) => {
              if (code !== 0) {
                reject(new Error(`backtest worker for ${shard.join(", ")} exited with code ${code}`));
                return;
              }
              console.log(`  seasons ${shard.join(", ")} done (${((Date.now() - started) / 1000).toFixed(0)}s)`);
              resolve(out);
            });
          }),
      ),
    );
    const shardsOut = await Promise.all(files.map(async (f) => JSON.parse(await readFile(f, "utf8")) as BacktestPrediction[]));
    return shardsOut.flat().sort((a, b) => a.season - b.season || a.week - b.week || a.gameId.localeCompare(b.gameId));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const seasons = parseSeasons(values.seasons);
  const sims = parseSims(values.sims);
  const seed = parseSeed(values.seed);
  const simConfig = { ...DEFAULT_SIM_CONFIG, homeFieldEpa: parseHfa(values["hfa-epa"]) };
  const featureConfig = { ...DEFAULT_FEATURE_CONFIG, halfLifeWeeks: parseHalfLife(values["half-life"]) };
  const options = { seasons, sims, seed, simConfig, featureConfig };

  if (values["shard-out"] !== undefined) {
    const predictions = runBacktest(await loadInputs(seasons, true), options);
    await writeFile(values["shard-out"], JSON.stringify(predictions));
    return;
  }

  const workers = workerCount(seasons);
  console.log(
    `Walk-forward backtest ${seasons[0]}-${seasons[seasons.length - 1]}: ${sims.toLocaleString("en-US")} sims/game, ` +
      `seed ${seed}, home-field ${simConfig.homeFieldEpa} EPA/play, half-life ${featureConfig.halfLifeWeeks} weeks, ` +
      `injuries ${values["no-injuries"] ? "off" : "on"}, ${workers} worker${workers === 1 ? "" : "s"}`,
  );
  const started = Date.now();
  let predictions: BacktestPrediction[];
  if (workers > 1) {
    const passThrough = [
      "--sims",
      String(sims),
      "--seed",
      String(seed),
      "--hfa-epa",
      String(simConfig.homeFieldEpa),
      "--half-life",
      String(featureConfig.halfLifeWeeks),
      "--db",
      values.db,
      ...(values["no-injuries"] ? ["--no-injuries"] : []),
    ];
    predictions = await runInWorkers(splitSeasons(seasons, workers), passThrough);
  } else {
    predictions = runBacktest(await loadInputs(seasons, false), options, (p) => {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(
        `\r  ${p.season} week ${String(p.week).padStart(2)}: ${p.games} games  [${p.done}/${p.total} weeks, ${elapsed}s]   `,
      );
    });
    process.stdout.write("\n");
  }
  console.log(`  ${predictions.length} games in ${((Date.now() - started) / 1000).toFixed(0)}s`);

  const db = await openDatabase(values.db);
  try {
    await writeBacktestPredictions(db.connection, predictions);

    const comparison = compareToMarket(predictions);
    console.log("\nModel vs market (market = de-vigged moneyline, spread_line, total_line; lower is better)");
    console.log(
      formatTable(
        [
          "season",
          "games",
          "brier model",
          "brier mkt",
          "logloss model",
          "logloss mkt",
          "margin MAE model",
          "margin MAE mkt",
          "total MAE model",
          "total MAE mkt",
          "ATS",
          "O/U",
        ],
        comparison.map((c) => [
          String(c.season),
          c.model.games,
          ...pair(c.model, c.market, "brier", 4),
          ...pair(c.model, c.market, "logLoss", 4),
          ...pair(c.model, c.market, "marginMae", 2),
          ...pair(c.model, c.market, "totalMae", 2),
          percent(c.againstSpread),
          percent(c.overUnder),
        ]),
      ),
    );
    console.log("ATS / O/U: how often the model's side of the spread / total was right (pushes excluded)");

    const calibration = calibrationReport(predictions);
    console.log("\nCalibration: predicted vs actual home win rate, all seasons");
    console.log(
      formatTable(
        ["bucket", "model n", "model pred%", "model actual%", "mkt n", "mkt pred%", "mkt actual%"],
        calibrationRows(calibration.model, calibration.market),
      ),
    );
    console.log(`\nWrote ${predictions.length} predictions to ${BACKTEST_TABLE} in ${values.db}`);
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  console.error(`\n${cliErrorMessage(err)}`);
  process.exitCode = 1;
});
