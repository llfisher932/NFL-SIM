import type { WeekGame } from "../types/sim";

export const DIVISIONS: Record<string, readonly string[]> = {
  "AFC East": ["BUF", "MIA", "NE", "NYJ"],
  "AFC North": ["BAL", "CIN", "CLE", "PIT"],
  "AFC South": ["HOU", "IND", "JAX", "TEN"],
  "AFC West": ["DEN", "KC", "LAC", "LV"],
  "NFC East": ["DAL", "NYG", "PHI", "WAS"],
  "NFC North": ["CHI", "DET", "GB", "MIN"],
  "NFC South": ["ATL", "CAR", "NO", "TB"],
  "NFC West": ["ARI", "LA", "SEA", "SF"],
};

export const PLAYOFF_SEEDS = 7;
const MAX_ENUMERATED_GAMES = 14;

const divisionOf = new Map(Object.entries(DIVISIONS).flatMap(([division, teams]) => teams.map((t) => [t, division])));
const conferenceOf = (team: string) => divisionOf.get(team)?.slice(0, 3);

export interface Result {
  home: string;
  away: string;
  homePoints: number;
  awayPoints: number;
}

interface Tally {
  wins: number;
  games: number;
}

const pct = (t: Tally) => (t.games === 0 ? 0 : t.wins / t.games);

// Win share for one team in one game: 1, 0.5 for a tie, 0.
function share(result: Result, team: string): number {
  const own = result.home === team ? result.homePoints : result.awayPoints;
  const other = result.home === team ? result.awayPoints : result.homePoints;
  return own > other ? 1 : own === other ? 0.5 : 0;
}

const opponent = (result: Result, team: string) => (result.home === team ? result.away : result.home);

class Standings {
  private readonly byTeam = new Map<string, Result[]>();

  constructor(results: readonly Result[]) {
    for (const r of results) {
      for (const team of [r.home, r.away]) {
        const list = this.byTeam.get(team) ?? [];
        list.push(r);
        this.byTeam.set(team, list);
      }
    }
  }

  games(team: string): readonly Result[] {
    return this.byTeam.get(team) ?? [];
  }

  record(team: string, include: (opponent: string) => boolean = () => true): Tally {
    const games = this.games(team).filter((r) => include(opponent(r, team)));
    return { wins: games.reduce((s, r) => s + share(r, team), 0), games: games.length };
  }

  winPct(team: string): number {
    return pct(this.record(team));
  }

  combined(teams: readonly string[]): number {
    const tallies = teams.map((t) => this.record(t));
    const games = tallies.reduce((s, t) => s + t.games, 0);
    return games === 0 ? 0 : tallies.reduce((s, t) => s + t.wins, 0) / games;
  }

  strengthOfVictory(team: string): number {
    return this.combined(
      this.games(team).flatMap((r) => (share(r, team) === 1 ? [opponent(r, team)] : [])),
    );
  }

  strengthOfSchedule(team: string): number {
    return this.combined(this.games(team).map((r) => opponent(r, team)));
  }
}

type Metric = (team: string, tied: readonly string[]) => number;

function headToHead(s: Standings, requireAllPlayed: boolean): Metric {
  return (team, tied) => {
    const others = new Set(tied.filter((t) => t !== team));
    if (requireAllPlayed) {
      const allPlayed = tied.every((a) => tied.every((b) => a === b || s.games(a).some((r) => opponent(r, a) === b)));
      if (!allPlayed) return 0;
    }
    return pct(s.record(team, (o) => others.has(o)));
  };
}

function commonGames(s: Standings, minimum: number): Metric {
  return (team, tied) => {
    const opponentSets = tied.map((t) => new Set(s.games(t).map((r) => opponent(r, t))));
    const common = [...opponentSets[0]!].filter((o) => opponentSets.every((set) => set.has(o)) && !tied.includes(o));
    if (common.length < minimum) return 0;
    const set = new Set(common);
    return pct(s.record(team, (o) => set.has(o)));
  };
}

function divisionSteps(s: Standings): Metric[] {
  return [
    headToHead(s, false),
    (t) => pct(s.record(t, (o) => divisionOf.get(o) === divisionOf.get(t))),
    commonGames(s, 1),
    (t) => pct(s.record(t, (o) => conferenceOf(o) === conferenceOf(t))),
    (t) => s.strengthOfVictory(t),
    (t) => s.strengthOfSchedule(t),
  ];
}

function wildCardSteps(s: Standings): Metric[] {
  return [
    headToHead(s, true),
    (t) => pct(s.record(t, (o) => conferenceOf(o) === conferenceOf(t))),
    commonGames(s, 4),
    (t) => s.strengthOfVictory(t),
    (t) => s.strengthOfSchedule(t),
  ];
}

// Picks the best team among those tied on win percentage, restarting the steps whenever the
// group shrinks (the NFL rule). Alphabetical order stands in for the coin toss.
function pickBest(tied: readonly string[], steps: readonly Metric[]): string {
  let group = [...tied].sort();
  for (let i = 0; i < steps.length && group.length > 1; i++) {
    const scores = group.map((t) => steps[i]!(t, group));
    const best = Math.max(...scores);
    const next = group.filter((_, j) => Math.abs(scores[j]! - best) < 1e-12);
    if (next.length < group.length) {
      group = next;
      i = -1;
    }
  }
  return group[0]!;
}

function rank(teams: readonly string[], s: Standings, steps: (candidates: readonly string[]) => Metric[]): string[] {
  const remaining = [...teams];
  const order: string[] = [];
  while (remaining.length > 0) {
    const best = Math.max(...remaining.map((t) => s.winPct(t)));
    const tied = remaining.filter((t) => Math.abs(s.winPct(t) - best) < 1e-12);
    const pick = tied.length === 1 ? tied[0]! : pickBest(tied, steps(tied));
    order.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return order;
}

// Seeds 1-7 for one conference. Wild-card ties between teams from one division are first
// reduced to that division's best team, as the NFL does.
export function seedConference(conference: string, results: readonly Result[]): string[] {
  const s = new Standings(results);
  const divisions = Object.entries(DIVISIONS).filter(([name]) => name.startsWith(conference));
  const divisionOrder = new Map(divisions.map(([name, teams]) => [name, rank(teams, s, () => divisionSteps(s))]));
  const winners = divisions.map(([name]) => divisionOrder.get(name)![0]!);
  const seeds = rank(winners, s, () => wildCardSteps(s));

  const others = divisions.flatMap(([name]) => divisionOrder.get(name)!.slice(1));
  while (seeds.length < PLAYOFF_SEEDS && others.length > 0) {
    const best = Math.max(...others.map((t) => s.winPct(t)));
    const tied = others.filter((t) => Math.abs(s.winPct(t) - best) < 1e-12);
    const perDivision = [...new Set(tied.map((t) => divisionOf.get(t)!))].map((d) =>
      divisionOrder.get(d)!.find((t) => tied.includes(t))!,
    );
    const pick = perDivision.length === 1 ? perDivision[0]! : pickBest(perDivision, wildCardSteps(s));
    seeds.push(pick);
    others.splice(others.indexOf(pick), 1);
  }
  return seeds;
}

const toResult = (g: WeekGame): Result => ({
  home: g.home,
  away: g.away,
  homePoints: g.homeScore ?? 0,
  awayPoints: g.awayScore ?? 0,
});

// Teams whose playoff seed is the same under every outcome of the final regular-season week.
// Returns an empty map when the final week cannot be enumerated or earlier results are missing.
export function lockedSeeds(games: readonly WeekGame[], season: number): Map<string, number> {
  const regular = games.filter((g) => g.season === season && g.gameType === "REG");
  if (regular.length === 0) return new Map();
  const finalWeek = Math.max(...regular.map((g) => g.week));
  const earlier = regular.filter((g) => g.week < finalWeek);
  if (earlier.some((g) => g.homeScore === null || g.awayScore === null)) return new Map();
  const known = earlier.map(toResult);
  const locked = new Map<string, number>();

  for (const conference of ["AFC", "NFC"]) {
    const open = regular.filter(
      (g) => g.week === finalWeek && (conferenceOf(g.home) === conference || conferenceOf(g.away) === conference),
    );
    if (open.length > MAX_ENUMERATED_GAMES) continue;
    const seedsSeen = new Map<string, Set<number>>();
    for (let mask = 0; mask < 1 << open.length; mask++) {
      const outcomes = open.map((g, i) => ({
        home: g.home,
        away: g.away,
        homePoints: mask & (1 << i) ? 1 : 0,
        awayPoints: mask & (1 << i) ? 0 : 1,
      }));
      const seeds = seedConference(conference, [...known, ...outcomes]);
      const teams = Object.entries(DIVISIONS)
        .filter(([name]) => name.startsWith(conference))
        .flatMap(([, t]) => t);
      for (const team of teams) {
        const seed = seeds.indexOf(team) + 1;
        const seen = seedsSeen.get(team) ?? new Set<number>();
        seen.add(seed);
        seedsSeen.set(team, seen);
      }
    }
    for (const [team, seen] of seedsSeen) {
      const [only] = [...seen];
      if (seen.size === 1 && only !== undefined && only > 0) locked.set(team, only);
    }
  }
  return locked;
}
