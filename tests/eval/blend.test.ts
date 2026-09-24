import { describe, expect, it } from "vitest";
import { blendWeights, fitBlendWeight, gameWeights } from "../../src/eval/blend";
import type { BacktestPrediction } from "../../src/types/eval";

const prediction = (overrides: Partial<BacktestPrediction>): BacktestPrediction => ({
  gameId: "g",
  season: 2024,
  week: 6,
  home: "NYG",
  away: "TEN",
  neutralSite: false,
  homeWinProb: 0.6,
  tieProb: 0,
  marginMean: 3,
  marginP10: -10,
  marginP90: 16,
  totalMean: 44,
  totalP10: 30,
  totalP90: 58,
  spreadLine: 3,
  totalLine: 44,
  marketHomeWinProb: 0.6,
  homeScore: 24,
  awayScore: 21,
  ...overrides,
});

describe("eval/blend", () => {
  describe("fitBlendWeight", () => {
    it("puts all the weight on the market when the model adds nothing", () => {
      const pairs = [
        { market: 3, model: 10, actual: 3 },
        { market: -2, model: -9, actual: -2 },
      ];
      expect(fitBlendWeight(pairs)).toBe(0);
    });

    it("puts all the weight on the model when it is exactly right", () => {
      const pairs = [
        { market: 3, model: 7, actual: 7 },
        { market: -2, model: -6, actual: -6 },
      ];
      expect(fitBlendWeight(pairs)).toBe(1);
    });

    it("finds a partial weight when the truth lies between them", () => {
      expect(fitBlendWeight([{ market: 0, model: 10, actual: 2 }])).toBeCloseTo(0.2, 9);
    });

    it("is zero without data", () => {
      expect(fitBlendWeight([])).toBe(0);
    });
  });

  describe("blendWeights", () => {
    const regular = Array.from({ length: 40 }, (_, i) => prediction({ gameId: `r${i}`, week: 6 + (i % 10), marginMean: 10, spreadLine: 3, homeScore: 24, awayScore: 21 }));
    const playoffs = [prediction({ gameId: "p", week: 20, marginMean: 10, spreadLine: 3, homeScore: 31, awayScore: 21 })];

    it("fits the regular-season margin weight from regular-season games", () => {
      expect(blendWeights([...regular, ...playoffs]).margin.regular).toBe(0);
    });

    it("shrinks a small playoff sample toward the regular-season weight", () => {
      const playoffWeight = blendWeights([...regular, ...playoffs]).margin.playoffs;
      expect(playoffWeight).toBeGreaterThan(0);
      expect(playoffWeight).toBeLessThan(0.05);
    });
  });

  describe("gameWeights", () => {
    const weights = { margin: { regular: 0.15, playoffs: 0.4 }, total: { early: 0.3, rest: 0 } };

    it("uses the early totals weight in weeks 1-4", () => {
      expect(gameWeights(weights, 3, false)).toEqual({ margin: 0.15, total: 0.3 });
    });

    it("uses the playoff margin weight and later totals weight in the postseason", () => {
      expect(gameWeights(weights, 20, true)).toEqual({ margin: 0.4, total: 0 });
    });
  });
});
