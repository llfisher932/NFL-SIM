import { FIRST_DATA_SEASON, seasonsFrom } from "../features/league";
import { parseArgs } from "node:util";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { loadConversionCounts, loadDrives, loadSeasonGames, loadWeekGames } from "../data/drives";
import { DEFAULT_OVERRIDES_PATH, loadOverrides } from "../data/overrides";
import { loadPlayerGames } from "../data/playerGames";
import { PLAYER_PROJECTIONS_TABLE, writePlayerProjections } from "../data/playerProjectionStore";
import { loadTeamGames } from "../data/teamGames";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { absenceOverrides, createInjuryModel } from "../features/injuries";
import { createFeatureModel } from "../features/teamFeatures";
import { DEFAULT_PLAYER_CONFIG } from "../players/config";
import { projectWeek } from "../players/projectWeek";
import { DEFAULT_SEED, DEFAULT_SIM_CONFIG, DEFAULT_SIMS } from "../sim/config";
import { fitDriveModel } from "../sim/driveModel";
import { createWeekFeatureCache, ratingLookupFrom, teamsBySeason } from "../sim/matchups";
import type { PlayerProjection, StatSummary } from "../types/players";
import { cliErrorMessage, parseSeason, parseSeed, parseSims, parseWeek } from "./args";
import { loadInjuryInputs, mergeOverrides } from "./injuryContext";
import { fixed, formatTable, type Cell } from "./format";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    week: { type: "string" },
    sims: { type: "string", default: String(DEFAULT_SIMS) },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    overrides: { type: "string", default: DEFAULT_OVERRIDES_PATH },
    team: { type: "string" },
    "min-touches": { type: "string", default: "1" },
    "show-ids": { type: "boolean", default: false },
    "no-injuries": { type: "boolean", default: false },
    db: { type: "string", default: DEFAULT_DB_PATH },
  },
});

const range = (s: StatSummary) => `${fixed(s.p10, 0)}/${fixed(s.p50, 0)}/${fixed(s.p90, 0)}`;

function row(p: PlayerProjection, showIds: boolean): Cell[] {
  const skill = p.targets + p.carries >= 0.5;
  return [
    p.team,
    showIds ? `${p.name} (${p.playerId})` : p.name,
    p.position,
    fixed(p.targets, 1),
    fixed(p.carries, 1),
    skill ? fixed(p.receptions.mean, 1) : "",
    skill ? range(p.receptions) : "",
    skill ? fixed(p.recYards.mean, 1) : "",
    skill ? range(p.recYards) : "",
    p.carries >= 0.5 ? fixed(p.rushYards.mean, 1) : "",
    p.carries >= 0.5 ? range(p.rushYards) : "",
    p.starterQb ? fixed(p.passYards.mean, 0) : "",
    p.starterQb ? range(p.passYards) : "",
    p.starterQb ? fixed(p.passTds, 2) : "",
    fixed(p.touchdowns.mean, 2),
    `${fixed(100 * p.anytimeTdProb, 0)}%`,
  ];
}

async function main(): Promise<void> {
  const target = { season: parseSeason(values.season), week: parseWeek(values.week) };
  const sims = parseSims(values.sims);
  const seed = parseSeed(values.seed);
  const minTouches = Number(values["min-touches"]);
  const overrides = await loadOverrides(values.overrides);

  const db = await openDatabase(values.db);
  try {
    const teamGames = await loadTeamGames(db.connection);
    const drives = await loadDrives(db.connection);
    const conversions = await loadConversionCounts(db.connection);
    const playerGames = await loadPlayerGames(db.connection);
    const games = (await loadWeekGames(db.connection, target.season, target.week)).filter(
      (g) => !values.team || g.home === values.team || g.away === values.team,
    );
    if (games.length === 0) throw new Error(`no games for ${target.season} week ${target.week}`);
    const allGames = await loadSeasonGames(db.connection, seasonsFrom(FIRST_DATA_SEASON, target.season));
    const injuryInputs = await loadInjuryInputs(db.connection, !values["no-injuries"], overrides);

    const weekFeatures = createWeekFeatureCache(createFeatureModel(teamGames, DEFAULT_FEATURE_CONFIG), teamsBySeason(teamGames, allGames));
    const model = fitDriveModel(drives, conversions, target, ratingLookupFrom(weekFeatures), DEFAULT_SIM_CONFIG);
    const injuries = injuryInputs
      ? createInjuryModel({ ...injuryInputs, teamGames, games: allGames, weekFeatures, featureConfig: DEFAULT_FEATURE_CONFIG }).adjust(
          weekFeatures(target),
          target,
        )
      : null;
    const features = injuries?.features ?? weekFeatures(target);
    const playing = new Set(games.flatMap((g) => [g.home, g.away]));
    const automatic = injuries
      ? [...injuries.absences.values()].filter((a) => playing.has(a.team)).flatMap((a) => absenceOverrides(a))
      : [];
    const manual = overrides.filter((o) => o.season === target.season && o.week === target.week);
    const weekOverrides = mergeOverrides(manual, automatic);

    console.log(
      `${target.season} week ${target.week} player projections: ${sims.toLocaleString("en-US")} sims/game, seed ${seed}, ` +
        `${manual.length} manual overrides from ${values.overrides}, ` +
        `${automatic.length} automatic injury outs${injuries ? "" : " (injuries off)"}`,
    );
    console.log("ranges are p10/p50/p90; TD = rushing + receiving touchdowns\n");

    const all = projectWeek({
      target,
      games,
      model,
      features,
      playerGames,
      overrides: weekOverrides,
      simConfig: DEFAULT_SIM_CONFIG,
      playerConfig: DEFAULT_PLAYER_CONFIG,
      sims,
      seed,
    });
    for (const game of games) {
      const projections = all.filter((p) => p.gameId === game.gameId);

      const shown = projections
        .filter((p) => (!values.team || p.team === values.team) && (p.starterQb || p.targets + p.carries >= minTouches))
        .sort((a, b) => a.team.localeCompare(b.team) || Number(b.starterQb) - Number(a.starterQb) || b.targets + b.carries - (a.targets + a.carries));
      console.log(`${game.away} @ ${game.home}`);
      console.log(
        formatTable(
          ["team", "player", "pos", "tgt", "car", "rec", "rec", "rec yds", "rec yds", "rush yds", "rush yds", "pass yds", "pass yds", "pass TD", "TD", "any TD"],
          shown.map((p) => row(p, values["show-ids"])),
        ),
      );
      console.log("");
    }
    await writePlayerProjections(db.connection, target, all);
    console.log(`Wrote ${all.length} player projections to ${PLAYER_PROJECTIONS_TABLE} in ${values.db}`);
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  console.error(cliErrorMessage(err));
  process.exitCode = 1;
});
