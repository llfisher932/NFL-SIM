import type { TeamGame } from "../../src/types/features";

export const TEAMS = ["ARI", "BAL", "CHI", "DAL", "KC", "NYJ", "SF", "TEN"] as const;

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundRobin(teams: readonly string[]): [string, string][][] {
  const rotating = [...teams.slice(1)];
  const fixed = teams[0]!;
  return rotating.map(() => {
    const lineup = [fixed, ...rotating];
    const round: [string, string][] = [];
    for (let i = 0; i < lineup.length / 2; i++) round.push([lineup[i]!, lineup[lineup.length - 1 - i]!]);
    rotating.unshift(rotating.pop()!);
    return round;
  });
}

export interface Matchup {
  gameId: string;
  season: number;
  week: number;
  home: string;
  away: string;
}

export function schedule(seasons: readonly number[], teams: readonly string[] = TEAMS): Matchup[] {
  const rounds = roundRobin(teams);
  return seasons.flatMap((season) =>
    rounds.flatMap((round, i) =>
      round.map(([home, away]) => ({
        gameId: `${season}_${String(i + 1).padStart(2, "0")}_${away}_${home}`,
        season,
        week: i + 1,
        home,
        away,
      })),
    ),
  );
}

export function syntheticTeamGames(seasons: readonly number[], seed = 7): TeamGame[] {
  const random = seededRandom(seed);
  const talent = new Map<string, number>(TEAMS.map((t) => [t, (random() - 0.5) * 0.3]));
  return schedule(seasons).flatMap((m) =>
    [
      [m.home, m.away],
      [m.away, m.home],
    ].map(([team, opponent]) => {
      const edge = talent.get(team!)! - talent.get(opponent!)!;
      const passPlays = 30 + Math.floor(random() * 10);
      const rushPlays = 20 + Math.floor(random() * 10);
      const neutralPlays = 20 + Math.floor(random() * 10);
      return {
        gameId: m.gameId,
        season: m.season,
        week: m.week,
        team: team!,
        opponent: opponent!,
        passPlays,
        passEpa: passPlays * (0.05 + edge + (random() - 0.5) * 0.4),
        rushPlays,
        rushEpa: rushPlays * (-0.07 + edge / 2 + (random() - 0.5) * 0.3),
        plays: passPlays + rushPlays + 2,
        neutralPlays,
        neutralPasses: Math.round(neutralPlays * (0.45 + random() * 0.15)),
      };
    }),
  );
}

export function teamGame(overrides: Partial<TeamGame> & Pick<TeamGame, "team" | "opponent" | "week">): TeamGame {
  return {
    gameId: `2024_${String(overrides.week).padStart(2, "0")}_${overrides.team}_${overrides.opponent}`,
    season: 2024,
    passPlays: 35,
    passEpa: 0,
    rushPlays: 25,
    rushEpa: 0,
    plays: 62,
    neutralPlays: 25,
    neutralPasses: 13,
    ...overrides,
  };
}
