import { parseArgs } from "node:util";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { loadConversionCounts, loadDrives, loadSeasonGames } from "../data/drives";
import { loadTeamGames } from "../data/teamGames";
import { backtestPlan, predictWeek } from "../eval/backtest";
import { compareToMarket } from "../eval/report";
import {
  applyGridPoint,
  scoreFeatureConfig,
  type FeatureGridPoint,
  type FeatureScore,
} from "../eval/tuning";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { DEFAULT_SEED, DEFAULT_SIM_CONFIG } from "../sim/config";
import type { BacktestPrediction } from "../types/eval";
import { cliErrorMessage, parseHfa, parseSeasons, parseSeed, parseSims } from "./args";
import { fixed, formatTable } from "./format";

const HALF_LIVES = [4, 6, 8, 12, 20, 1000];
const PRIOR_SCALES = [0.5, 0.75, 1, 1.5, 2];
const RETENTION_SCALES = [0.6, 1, 1.4];

const { values } = parseArgs({
  options: {
    stage: { type: "string", default: "features" },
    tune: { type: "string", default: "2022-2023" },
    validate: { type: "string", default: "2024-2025" },
    top: { type: "string", default: "10" },
    sims: { type: "string", default: "1000" },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    "hfa-values": { type: "string", default: "0,0.01,0.015,0.02,0.025,0.03" },
    db: { type: "string", default: DEFAULT_DB_PATH },
  },
});

function rankCorrelation(a: readonly number[], b: readonly number[]): number {
  const ranks = (xs: readonly number[]) => {
    const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    order.forEach(([, i], rank) => (r[i] = rank));
    return r;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const d2 = ra.reduce((sum, r, i) => sum + (r - rb[i]!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

async function tuneFeatures(tuneSeasons: number[], validateSeasons: number[]): Promise<void> {
  const db = await openDatabase(values.db);
  const [teamGames, games] = await (async () => {
    try {
      return [await loadTeamGames(db.connection), await loadSeasonGames(db.connection, [...tuneSeasons, ...validateSeasons])];
    } finally {
      db.close();
    }
  })();

  const grid: FeatureGridPoint[] = HALF_LIVES.flatMap((halfLifeWeeks) =>
    PRIOR_SCALES.flatMap((priorScale) =>
      RETENTION_SCALES.map((retentionScale) => ({ halfLifeWeeks, priorScale, retentionScale })),
    ),
  );
  console.log(`Feature grid: ${grid.length} configs. Selecting on ${values.tune} margin RMSE; ${values.validate} is held out.`);

  const results: (FeatureGridPoint & FeatureScore)[] = grid.map((point) => ({
    ...point,
    ...scoreFeatureConfig(teamGames, games, applyGridPoint(DEFAULT_FEATURE_CONFIG, point), tuneSeasons, validateSeasons),
  }));

  const isDefault = (r: FeatureGridPoint) =>
    r.halfLifeWeeks === DEFAULT_FEATURE_CONFIG.halfLifeWeeks && r.priorScale === 1 && r.retentionScale === 1;
  const ranked = [...results].sort((a, b) => a.tuneRmse - b.tuneRmse);
  const shown = [...ranked.slice(0, Number(values.top)), ...ranked.filter(isDefault)];
  console.log(
    formatTable(
      ["rank", "half-life", "prior x", "retention x", "tune RMSE", "tune r", "valid RMSE", "valid r", "pts/EPA", "home pts"],
      shown.map((r) => [
        isDefault(r) ? `${ranked.indexOf(r) + 1} (default)` : String(ranked.indexOf(r) + 1),
        r.halfLifeWeeks >= 1000 ? "none" : r.halfLifeWeeks,
        r.priorScale,
        r.retentionScale,
        fixed(r.tuneRmse, 3),
        fixed(r.tuneCorrelation, 3),
        fixed(r.validateRmse, 3),
        fixed(r.validateCorrelation, 3),
        fixed(r.fit.slope, 1),
        fixed(r.fit.home, 2),
      ]),
    ),
  );
  const tuneRmse = results.map((r) => r.tuneRmse);
  const validRmse = results.map((r) => r.validateRmse);
  console.log(
    `\nTune RMSE range ${fixed(Math.min(...tuneRmse), 3)}-${fixed(Math.max(...tuneRmse), 3)}; ` +
      `rank agreement between tune and held-out RMSE across the grid: ${fixed(rankCorrelation(tuneRmse, validRmse), 2)} ` +
      "(near zero or negative = tuning gains do not carry over)",
  );
}

async function tuneHomeField(tuneSeasons: number[]): Promise<void> {
  const sims = parseSims(values.sims);
  const seed = parseSeed(values.seed);
  const hfaValues = values["hfa-values"].split(",").map((v) => parseHfa(v.trim()));
  const db = await openDatabase(values.db);
  const inputs = await (async () => {
    try {
      return {
        teamGames: await loadTeamGames(db.connection),
        drives: await loadDrives(db.connection),
        conversions: await loadConversionCounts(db.connection),
        games: await loadSeasonGames(db.connection, tuneSeasons),
      };
    } finally {
      db.close();
    }
  })();

  console.log(`Home-field sweep on ${values.tune}: ${hfaValues.join(", ")} EPA/play, ${sims} sims/game (drive models fit once per week)`);
  const predictions = new Map<number, BacktestPrediction[]>(hfaValues.map((h) => [h, []]));
  const options = {
    seasons: tuneSeasons,
    sims,
    seed,
    simConfig: DEFAULT_SIM_CONFIG,
    featureConfig: DEFAULT_FEATURE_CONFIG,
  };
  for (const week of backtestPlan(inputs, options)) {
    for (const hfa of hfaValues) {
      predictions.get(hfa)!.push(...predictWeek(week, { ...DEFAULT_SIM_CONFIG, homeFieldEpa: hfa }, sims, seed));
    }
    process.stdout.write(`\r  ${week.target.season} week ${String(week.target.week).padStart(2)} [${week.done}/${week.total}]   `);
  }
  process.stdout.write("\n\n");

  console.log(
    formatTable(
      ["hfa EPA/play", "brier", "logloss", "margin MAE", "avg home margin", "actual", "vegas"],
      hfaValues.map((hfa) => {
        const rows = predictions.get(hfa)!;
        const all = compareToMarket(rows).at(-1)!;
        const home = rows.filter((p) => !p.neutralSite);
        const avg = (f: (p: BacktestPrediction) => number) => home.reduce((s, p) => s + f(p), 0) / home.length;
        return [
          hfa,
          fixed(all.model.brier, 4),
          fixed(all.model.logLoss, 4),
          fixed(all.model.marginMae, 3),
          fixed(avg((p) => p.marginMean), 2),
          fixed(avg((p) => p.homeScore - p.awayScore), 2),
          fixed(avg((p) => p.spreadLine ?? 0), 2),
        ];
      }),
    ),
  );
}

async function main(): Promise<void> {
  const tuneSeasons = parseSeasons(values.tune);
  const validateSeasons = parseSeasons(values.validate);
  if (values.stage === "features") await tuneFeatures(tuneSeasons, validateSeasons);
  else if (values.stage === "hfa") await tuneHomeField(tuneSeasons);
  else throw new Error(`invalid stage: ${values.stage}`);
}

main().catch((err: unknown) => {
  console.error(`\n${cliErrorMessage(err)}`);
  process.exitCode = 1;
});
