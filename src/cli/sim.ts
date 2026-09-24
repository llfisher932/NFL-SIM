import { FIRST_DATA_SEASON, seasonsFrom } from "../features/league";
import { parseArgs } from "node:util";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { DEFAULT_OVERRIDES_PATH, loadOverrides } from "../data/overrides";
import { loadConversionCounts, loadDrives, loadSeasonGames, loadWeekGames } from "../data/drives";
import { loadPlayerNames } from "../data/availability";
import { loadTeamGames } from "../data/teamGames";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { createInjuryModel } from "../features/injuries";
import { createFeatureModel } from "../features/teamFeatures";
import { DEFAULT_SEED, DEFAULT_SIM_CONFIG, DEFAULT_SIMS } from "../sim/config";
import { fitDriveModel } from "../sim/driveModel";
import { buildMatchup, createWeekFeatureCache, ratingLookupFrom, teamsBySeason } from "../sim/matchups";
import { projectGame } from "../sim/monteCarlo";
import { hashSeed } from "../sim/rng";
import { cliErrorMessage, parseHfa, parseSeason, parseSeed, parseSims, parseWeek } from "./args";
import { describeAbsence, loadInjuryInputs } from "./injuryContext";
import { fixed, formatTable } from "./format";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    week: { type: "string" },
    sims: { type: "string", default: String(DEFAULT_SIMS) },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    "hfa-epa": { type: "string", default: String(DEFAULT_SIM_CONFIG.homeFieldEpa) },
    "no-injuries": { type: "boolean", default: false },
    overrides: { type: "string", default: DEFAULT_OVERRIDES_PATH },
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

  const overrides = await loadOverrides(values.overrides);
  const db = await openDatabase(values.db);
  const [teamGames, drives, conversions, games, allGames, injuryInputs, names] = await (async () => {
    try {
      return [
        await loadTeamGames(db.connection),
        await loadDrives(db.connection),
        await loadConversionCounts(db.connection),
        await loadWeekGames(db.connection, target.season, target.week),
        await loadSeasonGames(db.connection, seasonsFrom(FIRST_DATA_SEASON, target.season)),
        await loadInjuryInputs(db.connection, !values["no-injuries"], overrides),
        await loadPlayerNames(db.connection),
      ] as const;
    } finally {
      db.close();
    }
  })();
  if (games.length === 0) throw new Error(`no games scheduled for ${target.season} week ${target.week}`);

  const weekFeatures = createWeekFeatureCache(
    createFeatureModel(teamGames, DEFAULT_FEATURE_CONFIG),
    teamsBySeason(teamGames, allGames),
  );
  const model = fitDriveModel(drives, conversions, target, ratingLookupFrom(weekFeatures), config);
  const injuries = injuryInputs
    ? createInjuryModel({ ...injuryInputs, teamGames, games: allGames, weekFeatures, featureConfig: DEFAULT_FEATURE_CONFIG }).adjust(
        weekFeatures(target),
        target,
      )
    : null;
  const features = injuries?.features ?? weekFeatures(target);

  console.log(
    `${target.season} week ${target.week}: ${games.length} games, ${sims.toLocaleString("en-US")} sims each, ` +
      `seed ${seed}, home-field ${config.homeFieldEpa} EPA/play, ${model.trainingDrives.toLocaleString("en-US")} training drives, ` +
      `injuries ${injuries ? "on" : "off"}\n`,
  );

  const netShift = (team: string) => {
    const before = weekFeatures(target).get(team)!;
    const after = features.get(team)!;
    return after.offense.all - after.defense.all - (before.offense.all - before.defense.all);
  };
  const injuryShift = (away: string, home: string) => `${signed(netShift(away), 3)}/${signed(netShift(home), 3)}`;

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
      injuries ? injuryShift(game.away, game.home) : "",
    ];
  });

  console.log(
    formatTable(
      ["game", "home win%", "score (A-H)", "margin", "margin p10..p90", "vegas", "total", "total p10..p90", "vegas", "actual", "injury shift (A/H)"],
      rows,
    ),
  );
  console.log("\nmargin and vegas spread are from the home team's side (positive = home favored)");
  if (injuries) {
    console.log("injury shift = change in net rating (offense - defense, EPA/play) from missing players; regulars out:");
    for (const game of games) {
      for (const team of [game.away, game.home]) {
        const out = describeAbsence(injuries.absences.get(team), names);
        if (out) console.log(`  ${team}: ${out}`);
      }
    }
  }
}

main().catch((err: unknown) => {
  console.error(cliErrorMessage(err));
  process.exitCode = 1;
});
