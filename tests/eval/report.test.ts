import { describe, expect, it } from "vitest";
import { calibrationReport, compareToMarket, modelWinProbability } from "../../src/eval/report";
import type { BacktestPrediction } from "../../src/types/eval";

function prediction(overrides: Partial<BacktestPrediction>): BacktestPrediction {
  return {
    gameId: "G",
    season: 2024,
    week: 1,
    home: "H",
    away: "A",
    neutralSite: false,
    homeWinProb: 0.6,
    tieProb: 0,
    marginMean: 3,
    marginP10: -12,
    marginP90: 18,
    totalMean: 44,
    totalP10: 30,
    totalP90: 58,
    spreadLine: 2,
    totalLine: 45,
    marketHomeWinProb: 0.55,
    homeScore: 24,
    awayScore: 20,
    ...overrides,
  };
}

const predictions = [
  prediction({ gameId: "a", season: 2023 }),
  prediction({ gameId: "b", season: 2024, homeWinProb: 0.3, marginMean: -4, homeScore: 17, awayScore: 27 }),
  prediction({ gameId: "c", season: 2024, marketHomeWinProb: null }),
];

describe("eval/report", () => {
  describe("modelWinProbability", () => {
    it("splits the tie probability between the teams", () => {
      expect(modelWinProbability(prediction({ homeWinProb: 0.5, tieProb: 0.02 }))).toBeCloseTo(0.51);
    });
  });

  describe("compareToMarket", () => {
    const rows = compareToMarket(predictions);

    it("returns one row per season plus an overall row", () => {
      expect(rows.map((r) => r.season)).toEqual([2023, 2024, "all"]);
    });

    it("scores model and market on the same priced games only", () => {
      expect(rows.find((r) => r.season === "all")).toMatchObject({ model: { games: 2 }, market: { games: 2 } });
    });

    it("computes the model's Brier score from its win probability", () => {
      expect(rows[0]!.model.brier).toBeCloseTo((0.6 - 1) ** 2);
    });

    it("computes the market's Brier score from the de-vigged probability", () => {
      expect(rows[0]!.market.brier).toBeCloseTo((0.55 - 1) ** 2);
    });

    it("measures margin error against the spread for the market", () => {
      expect(rows[0]!.market.marginMae).toBe(2);
      expect(rows[0]!.model.marginMae).toBe(1);
    });

    it("measures total error against the total line for the market", () => {
      expect(rows[0]!.market.totalMae).toBe(1);
      expect(rows[0]!.model.totalMae).toBe(0);
    });

    it("tracks the model's side of the spread and total", () => {
      expect(rows[0]!.againstSpread).toEqual({ hits: 1, decisions: 1 });
      expect(rows[0]!.overUnder).toEqual({ hits: 1, decisions: 1 });
    });
  });

  describe("calibrationReport", () => {
    it("buckets model and market probabilities separately", () => {
      const report = calibrationReport(predictions);
      expect(report.model[6]!.games).toBe(1);
      expect(report.market[5]!.games).toBe(2);
    });
  });
});
