import { loadPlayerNames } from "../data/availability";
import { loadBacktestPredictions } from "../data/backtestStore";
import {
  DEFAULT_DASHBOARD_DIR,
  readDashboardIndex,
  RECORD_FILE,
  writeDashboardIndex,
  writeDashboardRecord,
  writeDashboardWeek,
} from "../data/dashboardStore";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { loadConversionCounts, loadDrives, loadSeasonGames } from "../data/drives";
import { DEFAULT_OVERRIDES_PATH, loadOverrides } from "../data/overrides";
import { appendPickSnapshots, loadPickSnapshots } from "../data/pickLog";
import { loadPlayerGames } from "../data/playerGames";
import { loadTeamGames } from "../data/teamGames";
import { buildDashboardGame, buildRecord, indexEntry, mergeIndex, weekFileName } from "../dashboard/build";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { absenceOverrides, createInjuryModel } from "../features/injuries";
import { createFeatureModel } from "../features/teamFeatures";
import { DEFAULT_PLAYER_CONFIG } from "../players/config";
import { projectWeek } from "../players/projectWeek";
import { DEFAULT_SEED, DEFAULT_SIM_CONFIG, DEFAULT_SIMS } from "../sim/config";
import { fitDriveModel } from "../sim/driveModel";
import { buildMatchup, createWeekFeatureCache, ratingLookupFrom, teamsBySeason } from "../sim/matchups";
import { projectGame } from "../sim/monteCarlo";
import { hashSeed } from "../sim/rng";
import { hasStarted, trackerReport, trackPicks } from "../eval/tracker";
import type { DashboardIndexEntry, DashboardWeek } from "../types/dashboard";
import type { PickSnapshot } from "../types/tracker";
import { loadInjuryInputs, mergeOverrides } from "./injuryContext";


const FIRST_DATA_SEASON = 2021;

export interface ExportOptions {
  season: number;
  weeks: readonly number[];
  sims: number;
  seed: number;
  out: string;
  overridesPath: string;
  injuries: boolean;
  dbPath: string;
  log: (line: string) => void;
}

export async function exportWeeks(options: ExportOptions): Promise<void> {
  const { season, weeks, sims, seed, log } = options;
  const manualOverrides = await loadOverrides(options.overridesPath);

  const db = await openDatabase(options.dbPath);
  const data = await (async () => {
    try {
      return {
        teamGames: await loadTeamGames(db.connection),
        drives: await loadDrives(db.connection),
        conversions: await loadConversionCounts(db.connection),
        playerGames: await loadPlayerGames(db.connection),
        games: await loadSeasonGames(
          db.connection,
          Array.from({ length: season - FIRST_DATA_SEASON + 1 }, (_, i) => FIRST_DATA_SEASON + i),
        ),
        injuries: await loadInjuryInputs(db.connection, options.injuries, manualOverrides),
        names: await loadPlayerNames(db.connection),
        backtest: await loadBacktestPredictions(db.connection),
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

  const entries: DashboardIndexEntry[] = [];
  const now = new Date();
  const snapshots: PickSnapshot[] = [];
  for (const week of weeks) {
    const target = { season, week };
    const games = data.games.filter((g) => g.season === season && g.week === week);
    if (games.length === 0) {
      log(`  ${season} week ${week}: no games scheduled, skipped`);
      continue;
    }
    const started = Date.now();
    const model = fitDriveModel(data.drives, data.conversions, target, ratingLookupFrom(weekFeatures), DEFAULT_SIM_CONFIG);
    const baseline = weekFeatures(target);
    const adjusted = injuryModel?.adjust(baseline, target);
    const features = adjusted?.features ?? baseline;
    const automatic = adjusted ? [...adjusted.absences.values()].flatMap((a) => absenceOverrides(a)) : [];
    const overrides = mergeOverrides(manualOverrides, automatic);
    const players = projectWeek({
      target,
      games,
      model,
      features,
      playerGames: data.playerGames,
      overrides,
      simConfig: DEFAULT_SIM_CONFIG,
      playerConfig: DEFAULT_PLAYER_CONFIG,
      sims,
      seed,
    });

    const projections = new Map(
      games.map((game) => [
        game.gameId,
        projectGame(model, buildMatchup(features, game), DEFAULT_SIM_CONFIG, sims, hashSeed(seed, game.gameId)),
      ]),
    );
    for (const game of games) {
      if (hasStarted(game, now)) continue;
      const projection = projections.get(game.gameId)!;
      snapshots.push({
        gameId: game.gameId,
        season,
        week,
        capturedAt: now.toISOString(),
        home: game.home,
        away: game.away,
        modelHomeWinProb: projection.homeWinProb,
        modelMargin: projection.margin.mean,
        modelTotal: projection.total.mean,
        spreadLine: game.spreadLine,
        totalLine: game.totalLine,
      });
    }

    const dashboardWeek: DashboardWeek = {
      season,
      week,
      generatedAt: new Date().toISOString(),
      sims,
      seed,
      injuries: injuryModel !== null,
      games: games.map((game) =>
        buildDashboardGame({
          game,
          projection: projections.get(game.gameId)!,
          players: players.filter((p) => p.gameId === game.gameId),
          ratings: { home: features.get(game.home)!, away: features.get(game.away)! },
          baseline: { home: baseline.get(game.home)!, away: baseline.get(game.away)! },
          absences: { home: adjusted?.absences.get(game.home), away: adjusted?.absences.get(game.away) },
          names: data.names,
        }),
      ),
    };
    await writeDashboardWeek(options.out, weekFileName(season, week), dashboardWeek);
    entries.push(indexEntry(dashboardWeek));
    log(`  ${season} week ${week}: ${games.length} games, ${players.length} players (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }

  const logDb = await openDatabase(options.dbPath);
  let logged: PickSnapshot[];
  try {
    if (snapshots.length > 0) await appendPickSnapshots(logDb.connection, snapshots);
    logged = await loadPickSnapshots(logDb.connection);
  } finally {
    logDb.close();
  }
  const tracker = trackerReport(season, trackPicks(logged, data.games, now));
  log(`  pick log: ${snapshots.length} new snapshot(s), ${tracker.picks.length} tracked pick(s) this season`);

  let record: string | null = null;
  if (data.backtest && data.backtest.length > 0) {
    await writeDashboardRecord(options.out, buildRecord(data.backtest, now.toISOString(), tracker));
    record = RECORD_FILE;
    log(`  model record: ${data.backtest.length} backtest predictions`);
  }
  await writeDashboardIndex(options.out, mergeIndex(await readDashboardIndex(options.out), entries, record));
  log(`Wrote ${entries.length} week(s) to ${options.out}`);
}
