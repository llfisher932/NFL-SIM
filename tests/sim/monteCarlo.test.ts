import { describe, expect, it } from "vitest";
import { fitDriveModel } from "../../src/sim/driveModel";
import { distribution, histogram, projectGame, quantile } from "../../src/sim/monteCarlo";
import type { Matchup } from "../../src/types/sim";
import { conversions, fixedRatings, syntheticDrives, testSimConfig } from "../fixtures/drives";

const model = fitDriveModel(
  syntheticDrives([2023, 2024], 10),
  conversions(2023, 1, 90, 5, 5),
  { season: 2024, week: 6 },
  fixedRatings,
  testSimConfig,
);

const matchup = (homeOffense: number, awayOffense: number): Matchup => ({
  home: { team: "H", offense: homeOffense, defense: 0, playsPerGame: 64 },
  away: { team: "A", offense: awayOffense, defense: 0, playsPerGame: 64 },
  neutralSite: true,
  postseason: false,
  leaguePlaysPerGame: 64,
});

describe("sim/monteCarlo", () => {
  describe("quantile", () => {
    const sorted = [1, 2, 3, 4, 5];

    it("returns the median of an odd sample", () => {
      expect(quantile(sorted, 0.5)).toBe(3);
    });

    it("interpolates between neighbors", () => {
      expect(quantile(sorted, 0.1)).toBeCloseTo(1.4);
    });

    it("returns the extremes at 0 and 1", () => {
      expect([quantile(sorted, 0), quantile(sorted, 1)]).toEqual([1, 5]);
    });

    it("rejects an empty sample", () => {
      expect(() => quantile([], 0.5)).toThrow("empty sample");
    });
  });

  describe("distribution", () => {
    it("summarizes mean and percentiles regardless of order", () => {
      expect(distribution(Float64Array.from([5, 1, 4, 2, 3]))).toEqual({
        mean: 3,
        p10: expect.closeTo(1.4),
        p25: 2,
        p50: 3,
        p75: 4,
        p90: expect.closeTo(4.6),
      });
    });
  });

  describe("histogram", () => {
    it("counts each integer value from the minimum to the maximum", () => {
      expect(histogram(Float64Array.from([-3, 0, 0, 3, 7]))).toEqual({ start: -3, counts: [1, 0, 0, 2, 0, 0, 1, 0, 0, 0, 1] });
    });

    it("is empty for no values", () => {
      expect(histogram(new Float64Array())).toEqual({ start: 0, counts: [] });
    });
  });

  describe("projectGame", () => {
    const even = projectGame(model, matchup(0, 0), testSimConfig, 2000, 1);

    it("produces probabilities that sum to one", () => {
      expect(even.homeWinProb + even.awayWinProb + even.tieProb).toBeCloseTo(1, 12);
    });

    it("is reproducible from the seed", () => {
      expect(projectGame(model, matchup(0, 0), testSimConfig, 2000, 1)).toEqual(even);
    });

    it("changes with a different seed", () => {
      expect(projectGame(model, matchup(0, 0), testSimConfig, 2000, 2)).not.toEqual(even);
    });

    it("gives an evenly matched neutral-site game close to a coin flip", () => {
      expect(even.homeWinProb).toBeGreaterThan(0.4);
      expect(even.homeWinProb).toBeLessThan(0.6);
    });

    it("favors the stronger offense", () => {
      const lopsided = projectGame(model, matchup(0.15, -0.15), testSimConfig, 2000, 1);
      expect(lopsided.homeWinProb).toBeGreaterThan(even.homeWinProb + 0.1);
      expect(lopsided.margin.mean).toBeGreaterThan(even.margin.mean);
    });

    it("keeps margin percentiles ordered", () => {
      const m = even.margin;
      expect([m.p10, m.p25, m.p50, m.p75, m.p90]).toEqual([m.p10, m.p25, m.p50, m.p75, m.p90].sort((a, b) => a - b));
    });

    it("keeps the mean total equal to the sum of mean scores", () => {
      expect(even.total.mean).toBeCloseTo(even.homeScore.mean + even.awayScore.mean, 9);
    });

    it("returns margin and total histograms that cover every sim", () => {
      const sum = (h: { counts: number[] }) => h.counts.reduce((a, b) => a + b, 0);
      expect(sum(even.marginHistogram)).toBe(2000);
      expect(sum(even.totalHistogram)).toBe(2000);
    });

    it("rejects a non-positive sim count", () => {
      expect(() => projectGame(model, matchup(0, 0), testSimConfig, 0, 1)).toThrow("invalid sims");
    });
  });
});
