import type {
  FeatureConfig,
  SeasonSchedule,
  SeasonWeek,
  Split,
  TeamGame,
  TeamWeekFeatures,
  UnitRatings,
} from "../types/features";
import { END_OF_SEASON_WEEK } from "./config";
import { PREVIOUS_CODE } from "./league";
import { fitOpponentAdjusted, type Observation } from "./opponentAdjust";
import { regressToward, shrinkRate } from "./shrinkage";
import { seasonWindow, type Weighted } from "./window";

const SPLITS: readonly Split[] = ["all", "pass", "rush"];

interface TeamPrior {
  offense: UnitRatings;
  defense: UnitRatings;
  playsPerGame: number;
  neutralPassRate: number;
}

interface SeasonPrior {
  league: UnitRatings;
  playsPerGame: number;
  neutralPassRate: number;
  teams: ReadonlyMap<string, TeamPrior>;
}

export interface FeatureModel {
  featuresAt(target: SeasonWeek, teams: readonly string[]): TeamWeekFeatures[];
}

const zeroRatings = (): UnitRatings => ({ all: 0, pass: 0, rush: 0 });

function splitSample(game: TeamGame, split: Split): { plays: number; epa: number } {
  if (split === "pass") return { plays: game.passPlays, epa: game.passEpa };
  if (split === "rush") return { plays: game.rushPlays, epa: game.rushEpa };
  return { plays: game.passPlays + game.rushPlays, epa: game.passEpa + game.rushEpa };
}

// A relocated franchise carries its rating from the code it used before the move.
function teamPrior(prior: SeasonPrior, team: string): TeamPrior | undefined {
  const previous = PREVIOUS_CODE[team];
  return prior.teams.get(team) ?? (previous === undefined ? undefined : prior.teams.get(previous));
}

function emptyPrior(config: FeatureConfig): SeasonPrior {
  return {
    league: zeroRatings(),
    playsPerGame: config.playsPerGame.fallback,
    neutralPassRate: config.neutralPassRate.fallback,
    teams: new Map(),
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function regressPrior(endOfSeason: readonly TeamWeekFeatures[], config: FeatureConfig): SeasonPrior {
  const first = endOfSeason[0];
  if (!first) return emptyPrior(config);
  const playsPerGame = mean(endOfSeason.map((t) => t.playsPerGame));
  const neutralPassRate = mean(endOfSeason.map((t) => t.neutralPassRate));
  const scale = (ratings: UnitRatings, retention: number): UnitRatings => ({
    all: retention * ratings.all,
    pass: retention * ratings.pass,
    rush: retention * ratings.rush,
  });
  return {
    league: first.league,
    playsPerGame,
    neutralPassRate,
    teams: new Map(
      endOfSeason.map((t) => [
        t.team,
        {
          offense: scale(t.offense, config.retention.offense),
          defense: scale(t.defense, config.retention.defense),
          playsPerGame: regressToward(t.playsPerGame, playsPerGame, config.playsPerGame.retention),
          neutralPassRate: regressToward(
            t.neutralPassRate,
            neutralPassRate,
            config.neutralPassRate.retention,
          ),
        },
      ]),
    ),
  };
}

function fitSplit(
  window: readonly Weighted<TeamGame>[],
  teams: readonly string[],
  prior: SeasonPrior,
  split: Split,
  config: FeatureConfig,
) {
  const observations: Observation[] = window.flatMap(({ item, weight }) => {
    const { plays, epa } = splitSample(item, split);
    return plays > 0
      ? [{ offense: item.team, defense: item.opponent, epaPerPlay: epa / plays, weight: plays * weight }]
      : [];
  });
  const priorFor = (side: "offense" | "defense") =>
    new Map(teams.map((team) => [team, teamPrior(prior, team)?.[side][split] ?? 0]));
  return fitOpponentAdjusted(
    observations,
    teams,
    { intercept: prior.league[split], offense: priorFor("offense"), defense: priorFor("defense") },
    {
      intercept: config.interceptPriorPlays,
      offense: config.priorPlays.offense[split],
      defense: config.priorPlays.defense[split],
    },
  );
}

function ratingsAt(
  games: readonly TeamGame[],
  target: SeasonWeek,
  teamList: readonly string[],
  prior: SeasonPrior,
  config: FeatureConfig,
): TeamWeekFeatures[] {
  const window = seasonWindow(games, target, config.halfLifeWeeks);
  const teams = [...new Set([...teamList, ...window.flatMap((g) => [g.item.team, g.item.opponent])])].sort();
  const fits = Object.fromEntries(
    SPLITS.map((split) => [split, fitSplit(window, teams, prior, split, config)]),
  ) as Record<Split, ReturnType<typeof fitSplit>>;
  const pick = (side: "offense" | "defense", team: string): UnitRatings => ({
    all: fits.all[side].get(team)!,
    pass: fits.pass[side].get(team)!,
    rush: fits.rush[side].get(team)!,
  });

  return teams.map((team) => {
    const own = window.filter((g) => g.item.team === team);
    const ownPrior = teamPrior(prior, team);
    const sum = (f: (g: Weighted<TeamGame>) => number) => own.reduce((acc, g) => acc + f(g), 0);
    return {
      season: target.season,
      week: target.week,
      team,
      gamesPlayed: own.length,
      offense: pick("offense", team),
      defense: pick("defense", team),
      league: { all: fits.all.intercept, pass: fits.pass.intercept, rush: fits.rush.intercept },
      playsPerGame: shrinkRate(
        sum((g) => g.weight * g.item.plays),
        sum((g) => g.weight),
        ownPrior?.playsPerGame ?? prior.playsPerGame,
        config.playsPerGame.priorWeight,
      ),
      neutralPassRate: shrinkRate(
        sum((g) => g.weight * g.item.neutralPasses),
        sum((g) => g.weight * g.item.neutralPlays),
        ownPrior?.neutralPassRate ?? prior.neutralPassRate,
        config.neutralPassRate.priorWeight,
      ),
    };
  });
}

export function createFeatureModel(games: readonly TeamGame[], config: FeatureConfig): FeatureModel {
  const priors = new Map<number, SeasonPrior>();

  function priorFor(season: number): SeasonPrior {
    const cached = priors.get(season);
    if (cached) return cached;
    const previous = games.filter((g) => g.season === season - 1);
    const prior =
      previous.length === 0
        ? emptyPrior(config)
        : regressPrior(
            ratingsAt(
              previous,
              { season: season - 1, week: END_OF_SEASON_WEEK },
              [...new Set(previous.map((g) => g.team))],
              priorFor(season - 1),
              config,
            ),
            config,
          );
    priors.set(season, prior);
    return prior;
  }

  return {
    featuresAt(target, teams) {
      return ratingsAt(games, target, teams, priorFor(target.season), config);
    },
  };
}

export function featuresAt(
  games: readonly TeamGame[],
  target: SeasonWeek,
  teams: readonly string[],
  config: FeatureConfig,
): TeamWeekFeatures[] {
  return createFeatureModel(games, config).featuresAt(target, teams);
}

export function buildFeatureTable(
  games: readonly TeamGame[],
  schedules: readonly SeasonSchedule[],
  config: FeatureConfig,
): TeamWeekFeatures[] {
  const model = createFeatureModel(games, config);
  return schedules.flatMap((s) => s.weeks.flatMap((week) => model.featuresAt({ season: s.season, week }, s.teams)));
}
