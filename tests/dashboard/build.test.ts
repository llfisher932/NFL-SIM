import { describe, expect, it } from "vitest";
import {
  buildDashboardGame,
  buildRecord,
  indexEntry,
  listAbsences,
  mergeIndex,
  weekFileName,
  weeksToRefresh,
  type GameInputs,
} from "../../src/dashboard/build";
import type { BacktestPrediction } from "../../src/types/eval";
import type { TeamWeekFeatures } from "../../src/types/features";
import type { TeamAbsence } from "../../src/types/injuries";
import type { PlayerProjection } from "../../src/types/players";
import type { GameProjection, WeekGame } from "../../src/types/sim";

const features = (team: string, offense: number, defense: number): TeamWeekFeatures => ({
  season: 2025,
  week: 5,
  team,
  gamesPlayed: 4,
  offense: { all: offense, pass: 0, rush: 0 },
  defense: { all: defense, pass: 0, rush: 0 },
  league: { all: 0, pass: 0, rush: 0 },
  playsPerGame: 64,
  neutralPassRate: 0.5,
});

const dist = { mean: 20, p10: 10, p25: 15, p50: 20, p75: 25, p90: 30 };
const summary = { mean: 10, p10: 0, p50: 8, p90: 25 };

const projection: GameProjection = {
  sims: 100,
  homeWinProb: 0.6,
  awayWinProb: 0.39,
  tieProb: 0.01,
  homeScore: dist,
  awayScore: dist,
  margin: dist,
  total: dist,
  drivesPerGame: 22,
  overtimeRate: 0.05,
  marginHistogram: { start: -1, counts: [1, 2, 3] },
  totalHistogram: { start: 40, counts: [3, 3] },
};

const game: WeekGame = {
  gameId: "2025_05_SF_LA",
  season: 2025,
  week: 5,
  gameType: "REG",
  kickoff: "2025-10-02T20:15",
  home: "LA",
  away: "SF",
  neutralSite: false,
  spreadLine: 8.5,
  totalLine: 43.5,
  homeMoneyline: -400,
  awayMoneyline: 310,
  homeScore: 23,
  awayScore: 26,
};

const absence: TeamAbsence = {
  season: 2025,
  week: 5,
  team: "SF",
  offense: { QB: 1, RB: 0, WR: 0, TE: 0, OL: 0 },
  defense: { DL: 0, LB: 0, DB: 0 },
  qbValue: 0.1,
  missing: [
    { playerId: "00-0000001", group: "QB", role: 0.97, probability: 1, reason: "out" },
    { playerId: "00-0000002", group: "OL", role: 0.1, probability: 1, reason: "inactive" },
    { playerId: "00-0000003", group: "WR", role: 0.8, probability: 0.24, reason: "questionable" },
  ],
};

const player = (overrides: Partial<PlayerProjection>): PlayerProjection => ({
  gameId: "2025_05_SF_LA",
  playerId: "00-0000010",
  name: "Receiver",
  position: "WR",
  team: "LA",
  opponent: "SF",
  starterQb: false,
  targets: 6,
  carries: 0,
  receptions: summary,
  recYards: summary,
  rushYards: summary,
  passYards: summary,
  passTds: 0,
  interceptions: 0,
  touchdowns: summary,
  anytimeTdProb: 0.3,
  ...overrides,
});

const inputs: GameInputs = {
  game,
  projection,
  players: [
    player({}),
    player({ playerId: "00-0000011", name: "Deep Reserve", targets: 0.1, carries: 0.1 }),
    player({ playerId: "00-0000012", name: "Starter QB", position: "QB", starterQb: true, targets: 0, carries: 0.2 }),
  ],
  ratings: { home: features("LA", 0.1, -0.02), away: features("SF", -0.09, 0) },
  baseline: { home: features("LA", 0.08, -0.02), away: features("SF", 0.01, 0) },
  absences: { home: undefined, away: absence },
  names: new Map([["00-0000001", "Brock Purdy"]]),
};

describe("dashboard/build", () => {
  describe("listAbsences", () => {
    it("keeps likely-absent regulars, most important first, with names", () => {
      expect(listAbsences(absence, inputs.names).map((a) => [a.name, a.reason])).toEqual([["Brock Purdy", "out"]]);
    });

    it("is empty without an absence record", () => {
      expect(listAbsences(undefined, inputs.names)).toEqual([]);
    });
  });

  describe("buildDashboardGame", () => {
    const built = buildDashboardGame(inputs);

    it("carries win probabilities and scores for each side", () => {
      expect(built.home).toMatchObject({ team: "LA", winProb: 0.6 });
      expect(built.away).toMatchObject({ team: "SF", winProb: 0.39 });
    });

    it("reports each team's injury shift in net rating", () => {
      expect(built.away.injuryShift).toBeCloseTo(-0.1, 9);
      expect(built.home.injuryShift).toBeCloseTo(0.02, 9);
    });

    it("includes the market's de-vigged win probability", () => {
      expect(built.vegas.homeWinProb).toBeCloseTo(0.8 / (0.8 + 100 / 410), 6);
    });

    it("records the final score", () => {
      expect(built.final).toEqual({ home: 23, away: 26 });
    });

    it("keeps starting QBs and players with real volume, QB first", () => {
      expect(built.players.map((p) => p.name)).toEqual(["Starter QB", "Receiver"]);
    });

    it("keeps the histograms", () => {
      expect(built.marginHistogram).toEqual(projection.marginHistogram);
    });
  });

  describe("index", () => {
    const week = { season: 2025, week: 5, generatedAt: "t", sims: 100, seed: 1, injuries: true, games: [] };

    it("names week files with zero-padded weeks", () => {
      expect(weekFileName(2025, 5)).toBe("week-2025-05.json");
    });

    it("merges entries newest first, replacing the same week", () => {
      const existing = { weeks: [indexEntry({ ...week, week: 4 }), indexEntry({ ...week, generatedAt: "old" })], record: "record.json" };
      const merged = mergeIndex(existing, [indexEntry(week), indexEntry({ ...week, week: 6 })], null);
      expect(merged.weeks.map((w) => [w.week, w.generatedAt])).toEqual([
        [6, "t"],
        [5, "t"],
        [4, "t"],
      ]);
      expect(merged.record).toBe("record.json");
    });
  });

  describe("weeksToRefresh", () => {
    const at = (week: number, played: boolean): WeekGame => ({ ...game, gameId: `g${week}${played}`, week, homeScore: played ? 20 : null, awayScore: played ? 17 : null });

    it("returns the latest completed week and the next week to play", () => {
      expect(weeksToRefresh([at(1, true), at(2, true), at(3, false), at(4, false)], 2025)).toEqual([2, 3]);
    });

    it("returns only the first week before the season starts", () => {
      expect(weeksToRefresh([at(1, false), at(2, false)], 2025)).toEqual([1]);
    });

    it("returns only the last week once the season is over", () => {
      expect(weeksToRefresh([at(21, true), at(22, true)], 2025)).toEqual([22]);
    });

    it("ignores other seasons", () => {
      expect(weeksToRefresh([{ ...at(5, false), season: 2024 }], 2025)).toEqual([]);
    });
  });

  describe("buildRecord", () => {
    const prediction = (overrides: Partial<BacktestPrediction>): BacktestPrediction => ({
      gameId: "G",
      season: 2024,
      week: 1,
      home: "H",
      away: "A",
      neutralSite: false,
      homeWinProb: 0.6,
      tieProb: 0,
      marginMean: 3,
      marginP10: -10,
      marginP90: 16,
      totalMean: 44,
      totalP10: 30,
      totalP90: 58,
      spreadLine: 2,
      totalLine: 45,
      marketHomeWinProb: 0.55,
      homeScore: 24,
      awayScore: 20,
      ...overrides,
    });

    it("summarizes seasons and calibration", () => {
      const built = buildRecord([prediction({}), prediction({ gameId: "H2", season: 2025 })], "now");
      expect(built.seasons.map((s) => s.season)).toEqual([2024, 2025, "all"]);
      expect(built.calibration.model).toHaveLength(10);
      expect(built.games).toBe(2);
    });
  });
});
