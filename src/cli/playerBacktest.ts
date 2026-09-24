import { FIRST_DATA_SEASON, seasonsFrom } from "../features/league";
import { parseArgs } from "node:util";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { loadConversionCounts, loadDrives, loadSeasonGames } from "../data/drives";
import { DEFAULT_OVERRIDES_PATH, loadOverrides } from "../data/overrides";
import { loadPlayerGames } from "../data/playerGames";
import { loadTeamGames } from "../data/teamGames";
import { evaluatePlayers, trailingBaseline, type PlayerEvalRow, type StatEval } from "../eval/playerEval";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { absenceOverrides, createInjuryModel } from "../features/injuries";
import { createFeatureModel } from "../features/teamFeatures";
import { DEFAULT_PLAYER_CONFIG } from "../players/config";
import { projectWeek } from "../players/projectWeek";
import { DEFAULT_SEED, DEFAULT_SIM_CONFIG } from "../sim/config";
import { fitDriveModel } from "../sim/driveModel";
import { createWeekFeatureCache, ratingLookupFrom, teamsBySeason } from "../sim/matchups";
import { cliErrorMessage, parseSeason, parseSeed, parseSims, parseWeek } from "./args";
import { loadInjuryInputs, mergeOverrides } from "./injuryContext";
import { fixed, formatTable, type Cell } from "./format";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    weeks: { type: "string", default: "4,8,12,16" },
    sims: { type: "string", default: "1000" },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    overrides: { type: "string", default: DEFAULT_OVERRIDES_PATH },
    "target-cv": { type: "string", default: String(DEFAULT_PLAYER_CONFIG.shareVolatility.targets) },
    "carry-cv": { type: "string", default: String(DEFAULT_PLAYER_CONFIG.shareVolatility.carries) },
    "rush-yards-cv": { type: "string", default: String(DEFAULT_PLAYER_CONFIG.yardsCv.rushing) },
    "rec-yards-cv": { type: "string", default: String(DEFAULT_PLAYER_CONFIG.yardsCv.receiving) },
    "no-injuries": { type: "boolean", default: false },
    db: { type: "string", default: DEFAULT_DB_PATH },
  },
});

function statRow(label: string, s: StatEval): Cell[] {
  return [
    label,
    s.games,
    s.absent,
    `${fixed(100 * s.coverage, 1)}%`,
    `${fixed(100 * s.coverageAbsentAsZero, 1)}%`,
    fixed(s.mae, 2),
    Number.isNaN(s.baselineMae) ? "" : fixed(s.baselineMae, 2),
    fixed(s.meanProjected, 1),
    fixed(s.meanActual, 1),
    fixed(s.meanProjectedAll, 1),
    fixed(s.meanActualAbsentAsZero, 1),
  ];
}

async function main(): Promise<void> {
  const season = parseSeason(values.season);
  const weeks = values.weeks.split(",").map((w) => parseWeek(w.trim()));
  const sims = parseSims(values.sims);
  const seed = parseSeed(values.seed);
  const playerConfig = {
    ...DEFAULT_PLAYER_CONFIG,
    shareVolatility: { targets: Number(values["target-cv"]), carries: Number(values["carry-cv"]) },
    yardsCv: { receiving: Number(values["rec-yards-cv"]), rushing: Number(values["rush-yards-cv"]) },
  };
  const overrides = await loadOverrides(values.overrides);

  const db = await openDatabase(values.db);
  const data = await (async () => {
    try {
      return {
        teamGames: await loadTeamGames(db.connection),
        drives: await loadDrives(db.connection),
        conversions: await loadConversionCounts(db.connection),
        playerGames: await loadPlayerGames(db.connection),
        games: await loadSeasonGames(db.connection, seasonsFrom(FIRST_DATA_SEASON, season)),
        injuries: await loadInjuryInputs(db.connection, !values["no-injuries"]),
      };
    } finally {
      db.close();
    }
  })();

  const weekFeatures = createWeekFeatureCache(
    createFeatureModel(data.teamGames, DEFAULT_FEATURE_CONFIG),
    teamsBySeason(data.teamGames, data.games),
  );
  const injuryModel = data.injuries
    ? createInjuryModel({ ...data.injuries, teamGames: data.teamGames, games: data.games, weekFeatures, featureConfig: DEFAULT_FEATURE_CONFIG })
    : null;
  const actualByKey = new Map(data.playerGames.map((g) => [`${g.gameId}:${g.playerId}`, g]));
  const rows: PlayerEvalRow[] = [];
  for (const week of weeks) {
    const target = { season, week };
    const games = data.games.filter((g) => g.season === season && g.week === week && g.homeScore !== null);
    const adjusted = injuryModel?.adjust(weekFeatures(target), target);
    const automatic = adjusted ? [...adjusted.absences.values()].flatMap((a) => absenceOverrides(a)) : [];
    const projections = projectWeek({
      target,
      games,
      model: fitDriveModel(data.drives, data.conversions, target, ratingLookupFrom(weekFeatures), DEFAULT_SIM_CONFIG),
      features: adjusted?.features ?? weekFeatures(target),
      playerGames: data.playerGames,
      overrides: mergeOverrides(overrides, automatic),
      simConfig: DEFAULT_SIM_CONFIG,
      playerConfig,
      sims,
      seed,
    });
    for (const projection of projections) {
      rows.push({
        projection,
        actual: actualByKey.get(`${projection.gameId}:${projection.playerId}`) ?? null,
        baseline: trailingBaseline(data.playerGames, projection.playerId, target),
      });
    }
    process.stdout.write(`\r  ${season} week ${week}: ${games.length} games`);
  }
  process.stdout.write("\n\n");

  const report = evaluatePlayers(rows);
  console.log(`${report.projected} player projections, ${report.appeared} appeared in the box score (only those are scored)`);
  console.log(
    formatTable(
      [
        "stat",
        "appeared",
        "absent",
        "coverage",
        "coverage (absent=0)",
        "MAE",
        "last-4 MAE",
        "mean proj",
        "mean actual",
        "mean proj (all)",
        "mean actual (absent=0)",
      ],
      [
        statRow("receptions (tgt >= 2)", report.receptions),
        statRow("receiving yards (tgt >= 2)", report.recYards),
        statRow("rushing yards (car >= 3)", report.rushYards),
        statRow("passing yards (starting QB)", report.passYards),
      ],
    ),
  );
  console.log(
    "coverage = share of results inside p10-p90 (target 80%). Absent players (no box-score line) were either inactive or\n" +
      'active with zero volume; the "absent=0" columns count them as zeros, so the truth lies between the two views.\n' +
      "MAE is over appeared players; last-4 = the player's mean over his previous four games.",
  );
  console.log("\nAnytime TD calibration (non-QBs)");
  console.log(
    formatTable(
      ["predicted", "n", "mean predicted", "actual rate"],
      report.anytimeTd
        .filter((b) => b.games > 0)
        .map((b) => [
          `${fixed(100 * b.lower, 0)}-${fixed(100 * b.upper, 0)}%`,
          b.games,
          `${fixed(100 * b.meanPredicted, 1)}%`,
          `${fixed(100 * b.actualRate, 1)}%`,
        ]),
    ),
  );
}

main().catch((err: unknown) => {
  console.error(`\n${cliErrorMessage(err)}`);
  process.exitCode = 1;
});
