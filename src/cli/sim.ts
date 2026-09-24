import { parseArgs } from "node:util";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { loadConversionCounts, loadDrives, loadWeekGames } from "../data/drives";
import { loadTeamGames } from "../data/teamGames";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { createFeatureModel } from "../features/teamFeatures";
import { DEFAULT_SEED, DEFAULT_SIM_CONFIG, DEFAULT_SIMS } from "../sim/config";
import { fitDriveModel } from "../sim/driveModel";
import { buildMatchup, createWeekFeatureCache, ratingLookupFrom, teamsBySeason } from "../sim/matchups";
import { projectGame } from "../sim/monteCarlo";
import { hashSeed } from "../sim/rng";
import { cliErrorMessage, parseHfa, parseSeason, parseSeed, parseSims, parseWeek } from "./args";
import { fixed, formatTable } from "./format";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    week: { type: "string" },
    sims: { type: "string", default: String(DEFAULT_SIMS) },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    "hfa-epa": { type: "string", default: String(DEFAULT_SIM_CONFIG.homeFieldEpa) },
    db: { type: "string", default: DEFAULT_DB_PATH },
  },
});

const signed = (value: number, digits = 1) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const range = (low: number, high: number) => `${signed(low, 0)}..${signed(high, 0)}`;

async function main(): Promise<void> {
  const target = { season: parseSeason(values.season), week: parseWeek(values.week) };
  const sims = parseSims(values.sims);
  const seed = parseSeed(values.seed);
  const config = { ...DEFAULT_SIM_CONFIG, homeFieldEpa: parseHfa(values["hfa-epa"]) };

  const db = await openDatabase(values.db);
  const [teamGames, drives, conversions, games] = await (async () => {
    try {
      return [
        await loadTeamGames(db.connection),
        await loadDrives(db.connection),
        await loadConversionCounts(db.connection),
        await loadWeekGames(db.connection, target.season, target.week),
      ] as const;
    } finally {
      db.close();
    }
  })();
  if (games.length === 0) throw new Error(`no games scheduled for ${target.season} week ${target.week}`);

  const weekFeatures = createWeekFeatureCache(
    createFeatureModel(teamGames, DEFAULT_FEATURE_CONFIG),
    teamsBySeason(teamGames, games),
  );
  const model = fitDriveModel(drives, conversions, target, ratingLookupFrom(weekFeatures), config);
  const features = weekFeatures(target);

  console.log(
    `${target.season} week ${target.week}: ${games.length} games, ${sims.toLocaleString("en-US")} sims each, ` +
      `seed ${seed}, home-field ${config.homeFieldEpa} EPA/play, ${model.trainingDrives.toLocaleString("en-US")} training drives\n`,
  );

  const rows = games.map((game) => {
    const p = projectGame(model, buildMatchup(features, game), config, sims, hashSeed(seed, game.gameId));
    const actual =
      game.homeScore === null || game.awayScore === null ? "" : `${game.awayScore}-${game.homeScore}`;
    return [
      `${game.away} @ ${game.home}${game.neutralSite ? " (N)" : ""}`,
      fixed(100 * p.homeWinProb, 1),
      `${fixed(p.awayScore.mean, 1)}-${fixed(p.homeScore.mean, 1)}`,
      signed(p.margin.mean),
      range(p.margin.p10, p.margin.p90),
      game.spreadLine === null ? "" : signed(game.spreadLine),
      fixed(p.total.mean, 1),
      `${fixed(p.total.p10, 0)}..${fixed(p.total.p90, 0)}`,
      game.totalLine === null ? "" : fixed(game.totalLine, 1),
      actual,
    ];
  });

  console.log(
    formatTable(
      ["game", "home win%", "score (A-H)", "margin", "margin p10..p90", "vegas", "total", "total p10..p90", "vegas", "actual"],
      rows,
    ),
  );
  console.log("\nmargin and vegas spread are from the home team's side (positive = home favored)");
}

main().catch((err: unknown) => {
  console.error(cliErrorMessage(err));
  process.exitCode = 1;
});
