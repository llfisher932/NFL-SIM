import type { FeatureModel } from "../features/teamFeatures";
import type { SeasonWeek, TeamWeekFeatures } from "../types/features";
import type { Matchup, TeamSimInputs, WeekGame } from "../types/sim";
import type { RatingLookup } from "./driveModel";

export type WeekFeatures = ReadonlyMap<string, TeamWeekFeatures>;

export function createWeekFeatureCache(
  model: FeatureModel,
  teamsBySeason: ReadonlyMap<number, readonly string[]>,
): (at: SeasonWeek) => WeekFeatures {
  const cache = new Map<string, WeekFeatures>();
  return (at) => {
    const key = `${at.season}-${at.week}`;
    let week = cache.get(key);
    if (!week) {
      const rows = model.featuresAt(at, teamsBySeason.get(at.season) ?? []);
      week = new Map(rows.map((r) => [r.team, r]));
      cache.set(key, week);
    }
    return week;
  };
}

function teamFeatures(week: WeekFeatures, team: string, at: SeasonWeek): TeamWeekFeatures {
  const features = week.get(team);
  if (!features) throw new Error(`no features for ${team} in ${at.season} week ${at.week}`);
  return features;
}

export function ratingLookupFrom(weekFeatures: (at: SeasonWeek) => WeekFeatures): RatingLookup {
  return (at, team) => {
    const f = teamFeatures(weekFeatures(at), team, at);
    return { offense: f.offense.all, defense: f.defense.all, league: f.league.all };
  };
}

export function buildMatchup(week: WeekFeatures, game: WeekGame): Matchup {
  const inputs = (team: string): TeamSimInputs => {
    const f = teamFeatures(week, team, game);
    return { team, offense: f.offense.all, defense: f.defense.all, playsPerGame: f.playsPerGame };
  };
  const all = [...week.values()];
  return {
    home: inputs(game.home),
    away: inputs(game.away),
    neutralSite: game.neutralSite,
    postseason: game.gameType !== "REG",
    leaguePlaysPerGame: all.reduce((sum, f) => sum + f.playsPerGame, 0) / all.length,
    leagueEpa: teamFeatures(week, game.home, game).league.all,
    ...(game.homeRest != null && game.awayRest != null ? { restDiff: game.homeRest - game.awayRest } : {}),
  };
}

export function teamsBySeason(
  teamGames: readonly { season: number; team: string }[],
  games: readonly WeekGame[],
): Map<number, string[]> {
  const teams = new Map<number, Set<string>>();
  const add = (season: number, team: string) => {
    const set = teams.get(season) ?? new Set<string>();
    set.add(team);
    teams.set(season, set);
  };
  for (const g of teamGames) add(g.season, g.team);
  for (const g of games) {
    add(g.season, g.home);
    add(g.season, g.away);
  }
  return new Map([...teams].map(([season, set]) => [season, [...set].sort()]));
}
