import { createFeatureModel } from "../features/teamFeatures";
import { fitDriveModel, type DriveModel } from "../sim/driveModel";
import {
  buildMatchup,
  createWeekFeatureCache,
  ratingLookupFrom,
  teamsBySeason,
  type WeekFeatures,
} from "../sim/matchups";
import { projectGame } from "../sim/monteCarlo";
import { hashSeed } from "../sim/rng";
import type { BacktestPrediction } from "../types/eval";
import type { FeatureConfig, SeasonWeek, TeamGame } from "../types/features";
import type { ConversionCount, DriveRecord, SimConfig, WeekGame } from "../types/sim";
import { devigHomeWinProbability } from "./market";

export interface BacktestInputs {
  teamGames: readonly TeamGame[];
  drives: readonly DriveRecord[];
  conversions: readonly ConversionCount[];
  games: readonly WeekGame[];
}

export interface BacktestOptions {
  seasons: readonly number[];
  sims: number;
  seed: number;
  simConfig: SimConfig;
  featureConfig: FeatureConfig;
}

export interface WeekProgress extends SeasonWeek {
  games: number;
  trainingDrives: number;
  done: number;
  total: number;
}

function isCompleted(game: WeekGame): game is WeekGame & { homeScore: number; awayScore: number } {
  return game.homeScore !== null && game.awayScore !== null;
}

export function backtestWeeks(games: readonly WeekGame[], seasons: readonly number[]): SeasonWeek[] {
  const keys = new Set(
    games.filter((g) => seasons.includes(g.season) && isCompleted(g)).map((g) => `${g.season}-${g.week}`),
  );
  return [...keys]
    .map((key) => {
      const [season, week] = key.split("-").map(Number);
      return { season: season!, week: week! };
    })
    .sort((a, b) => a.season - b.season || a.week - b.week);
}

type CompletedGame = WeekGame & { homeScore: number; awayScore: number };

export interface BacktestWeek {
  target: SeasonWeek;
  games: CompletedGame[];
  model: DriveModel;
  features: WeekFeatures;
  done: number;
  total: number;
}

// Walk-forward: every week's features and drive model are built from strictly earlier data.
export function* backtestPlan(inputs: BacktestInputs, options: BacktestOptions): Generator<BacktestWeek> {
  const weekFeatures = createWeekFeatureCache(
    createFeatureModel(inputs.teamGames, options.featureConfig),
    teamsBySeason(inputs.teamGames, inputs.games),
  );
  const ratings = ratingLookupFrom(weekFeatures);
  const weeks = backtestWeeks(inputs.games, options.seasons);
  for (const [index, target] of weeks.entries()) {
    yield {
      target,
      games: inputs.games.filter(
        (g): g is CompletedGame => g.season === target.season && g.week === target.week && isCompleted(g),
      ),
      model: fitDriveModel(inputs.drives, inputs.conversions, target, ratings, options.simConfig),
      features: weekFeatures(target),
      done: index + 1,
      total: weeks.length,
    };
  }
}

export function predictWeek(week: BacktestWeek, simConfig: SimConfig, sims: number, seed: number): BacktestPrediction[] {
  return week.games.map((game) => {
    const p = projectGame(week.model, buildMatchup(week.features, game), simConfig, sims, hashSeed(seed, game.gameId));
    return {
      gameId: game.gameId,
      season: game.season,
      week: game.week,
      home: game.home,
      away: game.away,
      neutralSite: game.neutralSite,
      homeWinProb: p.homeWinProb,
      tieProb: p.tieProb,
      marginMean: p.margin.mean,
      marginP10: p.margin.p10,
      marginP90: p.margin.p90,
      totalMean: p.total.mean,
      totalP10: p.total.p10,
      totalP90: p.total.p90,
      spreadLine: game.spreadLine,
      totalLine: game.totalLine,
      marketHomeWinProb:
        game.homeMoneyline === null || game.awayMoneyline === null
          ? null
          : devigHomeWinProbability(game.homeMoneyline, game.awayMoneyline),
      homeScore: game.homeScore,
      awayScore: game.awayScore,
    };
  });
}

export function runBacktest(
  inputs: BacktestInputs,
  options: BacktestOptions,
  onWeek: (progress: WeekProgress) => void = () => {},
): BacktestPrediction[] {
  const predictions: BacktestPrediction[] = [];
  for (const week of backtestPlan(inputs, options)) {
    predictions.push(...predictWeek(week, options.simConfig, options.sims, options.seed));
    onWeek({
      ...week.target,
      games: week.games.length,
      trainingDrives: week.model.trainingDrives,
      done: week.done,
      total: week.total,
    });
  }
  return predictions;
}
