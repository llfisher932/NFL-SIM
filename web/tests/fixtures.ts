import type { DashboardGame, DashboardPlayer, DashboardRecord, DashboardWeek } from "../../src/types/dashboard";

const dist = (mean: number, spread: number) => ({
  mean,
  p10: mean - spread,
  p25: mean - spread / 2,
  p50: mean,
  p75: mean + spread / 2,
  p90: mean + spread,
});

const summary = (mean: number, spread: number) => ({ mean, p10: Math.max(0, mean - spread), p50: mean, p90: mean + spread });

export function player(overrides: Partial<DashboardPlayer>): DashboardPlayer {
  return {
    playerId: "00-0000001",
    name: "Test Receiver",
    position: "WR",
    team: "LA",
    starterQb: false,
    targets: 7,
    carries: 0,
    receptions: summary(4.5, 3),
    recYards: summary(60, 45),
    rushYards: summary(0, 0),
    passYards: summary(0, 0),
    passTds: 0,
    interceptions: 0,
    touchdowns: 0.4,
    anytimeTdProb: 0.33,
    ...overrides,
  };
}

export function game(overrides: Partial<DashboardGame> = {}): DashboardGame {
  return {
    gameId: "2025_05_SF_LA",
    season: 2025,
    week: 5,
    gameType: "REG",
    kickoff: "2025-10-02T20:15",
    neutralSite: false,
    away: {
      team: "SF",
      winProb: 0.21,
      score: dist(16.2, 10),
      offense: -0.09,
      defense: 0,
      injuryShift: -0.103,
      out: [
        { playerId: "00-0037834", name: "Brock Purdy", group: "QB", role: 0.97, probability: 1, reason: "out" },
        { playerId: "00-0033288", name: "George Kittle", group: "TE", role: 0.5, probability: 1, reason: "reserve" },
        { playerId: "00-0099999", name: "Traded Player", group: "WR", role: 0.6, probability: 0.97, reason: "not on roster" },
      ],
    },
    home: { team: "LA", winProb: 0.78, score: dist(26.6, 11), offense: 0.1, defense: -0.02, injuryShift: 0.02, out: [] },
    tieProb: 0.01,
    margin: dist(10.4, 16),
    total: dist(42.8, 16),
    marginHistogram: { start: -3, counts: [1, 0, 0, 1, 2, 1, 0, 3, 1, 0, 4] },
    totalHistogram: { start: 30, counts: [1, 2, 3, 4, 3, 2, 1] },
    vegas: { spread: 8.5, total: 43.5, homeWinProb: 0.76 },
    final: { home: 23, away: 26 },
    players: [
      player({ playerId: "00-0000010", name: "Matthew Stafford", position: "QB", starterQb: true, targets: 0, carries: 2, passYards: summary(262, 80) }),
      player({}),
      player({ playerId: "00-0000011", name: "Test Back", position: "RB", team: "SF", targets: 3, carries: 15, rushYards: summary(70, 45) }),
    ],
    ...overrides,
  };
}

export function week(overrides: Partial<DashboardWeek> = {}): DashboardWeek {
  return {
    season: 2025,
    week: 5,
    generatedAt: "2026-09-24T12:00:00.000Z",
    sims: 2000,
    seed: 1,
    injuries: true,
    games: [game(), game({ gameId: "2025_05_KC_JAX", away: { ...game().away, team: "KC", out: [] }, home: { ...game().home, team: "JAX" }, final: null })],
    ...overrides,
  };
}

const card = (brier: number) => ({ games: 1139, brier, logLoss: 0.63, marginMae: 9.8, totalMae: 10.5 });

export function record(): DashboardRecord {
  const bucket = (lower: number, games: number, meanPredicted: number, actualRate: number) => ({
    lower,
    upper: lower + 0.1,
    games,
    meanPredicted,
    actualRate,
  });
  const buckets = [bucket(0.3, 100, 0.35, 0.36), bucket(0.6, 200, 0.65, 0.66), bucket(0.9, 0, Number.NaN, Number.NaN)];
  return {
    generatedAt: "2026-09-24T12:00:00.000Z",
    games: 1139,
    seasons: [
      { season: 2024, model: card(0.209), market: card(0.201), againstSpread: { hits: 150, decisions: 280 }, overUnder: { hits: 140, decisions: 280 } },
      { season: "all", model: card(0.2185), market: card(0.2095), againstSpread: { hits: 570, decisions: 1100 }, overUnder: { hits: 550, decisions: 1100 } },
    ],
    calibration: { model: buckets, market: buckets },
  };
}
