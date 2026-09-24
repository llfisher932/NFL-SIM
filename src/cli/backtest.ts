import { parseArgs } from "node:util";
import { BACKTEST_TABLE, writeBacktestPredictions } from "../data/backtestStore";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { loadConversionCounts, loadDrives, loadSeasonGames } from "../data/drives";
import { loadTeamGames } from "../data/teamGames";
import { runBacktest } from "../eval/backtest";
import { calibrationReport, compareToMarket } from "../eval/report";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { DEFAULT_SEED, DEFAULT_SIM_CONFIG } from "../sim/config";
import type { CalibrationBucket, HitRate, ScoreCard } from "../types/eval";
import { cliErrorMessage, parseHalfLife, parseHfa, parseSeasons, parseSeed, parseSims } from "./args";
import { loadInjuryInputs } from "./injuryContext";
import { fixed, formatTable, type Cell } from "./format";

const DEFAULT_BACKTEST_SIMS = 2000;
const FIRST_DATA_SEASON = 2021;

const allSeasonsThrough = (seasons: readonly number[]) =>
  Array.from({ length: Math.max(...seasons) - FIRST_DATA_SEASON + 1 }, (_, i) => FIRST_DATA_SEASON + i);

const { values } = parseArgs({
  options: {
    seasons: { type: "string", default: "2022-2025" },
    sims: { type: "string", default: String(DEFAULT_BACKTEST_SIMS) },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    "hfa-epa": { type: "string", default: String(DEFAULT_SIM_CONFIG.homeFieldEpa) },
    "half-life": { type: "string", default: String(DEFAULT_FEATURE_CONFIG.halfLifeWeeks) },
    "no-injuries": { type: "boolean", default: false },
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

async function main(): Promise<void> {
  const seasons = parseSeasons(values.seasons);
  const sims = parseSims(values.sims);
  const seed = parseSeed(values.seed);
  const simConfig = { ...DEFAULT_SIM_CONFIG, homeFieldEpa: parseHfa(values["hfa-epa"]) };
  const featureConfig = { ...DEFAULT_FEATURE_CONFIG, halfLifeWeeks: parseHalfLife(values["half-life"]) };

  const db = await openDatabase(values.db);
  try {
    const inputs = {
      teamGames: await loadTeamGames(db.connection),
      drives: await loadDrives(db.connection),
      conversions: await loadConversionCounts(db.connection),
      games: await loadSeasonGames(db.connection, allSeasonsThrough(seasons)),
      injuries: await loadInjuryInputs(db.connection, !values["no-injuries"]),
    };
    console.log(
      `Walk-forward backtest ${seasons[0]}-${seasons[seasons.length - 1]}: ${sims.toLocaleString("en-US")} sims/game, ` +
        `seed ${seed}, home-field ${simConfig.homeFieldEpa} EPA/play, half-life ${featureConfig.halfLifeWeeks} weeks, ` +
        `injuries ${inputs.injuries ? "on" : "off"}`,
    );

    const started = Date.now();
    const predictions = runBacktest(inputs, { seasons, sims, seed, simConfig, featureConfig }, (p) => {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(
        `\r  ${p.season} week ${String(p.week).padStart(2)}: ${p.games} games  [${p.done}/${p.total} weeks, ${elapsed}s]   `,
      );
    });
    process.stdout.write("\n");
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
