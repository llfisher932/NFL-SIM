import { describe, expect, it } from "vitest";
import {
  applyGridPoint,
  correlation,
  fitMargin,
  marginSamples,
  rmse,
  scoreFeatureConfig,
} from "../../src/eval/tuning";
import { DEFAULT_FEATURE_CONFIG } from "../../src/features/config";
import type { WeekGame } from "../../src/types/sim";
import { schedule, seededRandom, syntheticTeamGames } from "../fixtures/league";

describe("eval/tuning", () => {
  describe("applyGridPoint", () => {
    const tuned = applyGridPoint(DEFAULT_FEATURE_CONFIG, { halfLifeWeeks: 12, priorScale: 2, retentionScale: 1.4 });

    it("sets the half-life", () => {
      expect(tuned.halfLifeWeeks).toBe(12);
    });

    it("scales every prior weight", () => {
      expect(tuned.priorPlays.offense.pass).toBe(2 * DEFAULT_FEATURE_CONFIG.priorPlays.offense.pass);
      expect(tuned.priorPlays.defense.rush).toBe(2 * DEFAULT_FEATURE_CONFIG.priorPlays.defense.rush);
    });

    it("scales retention without exceeding 1", () => {
      expect(tuned.retention.offense).toBeCloseTo(0.7);
      expect(applyGridPoint(DEFAULT_FEATURE_CONFIG, { halfLifeWeeks: 8, priorScale: 1, retentionScale: 5 }).retention.offense).toBe(1);
    });

    it("leaves pace settings alone", () => {
      expect(tuned.playsPerGame).toEqual(DEFAULT_FEATURE_CONFIG.playsPerGame);
    });
  });

  describe("fitMargin", () => {
    const samples = [
      { isHome: 1, ratingGap: 0.1, margin: 2 + 60 * 0.1 },
      { isHome: 1, ratingGap: -0.05, margin: 2 - 60 * 0.05 },
      { isHome: 0, ratingGap: 0.2, margin: 60 * 0.2 },
      { isHome: 1, ratingGap: 0, margin: 2 },
    ];

    it("recovers home advantage and points per EPA from noise-free data", () => {
      const fit = fitMargin(samples);
      expect(fit.home).toBeCloseTo(2, 9);
      expect(fit.slope).toBeCloseTo(60, 9);
    });

    it("leaves zero error on noise-free data", () => {
      expect(rmse(samples, fitMargin(samples))).toBeCloseTo(0, 9);
    });

    it("throws when the design is degenerate", () => {
      expect(() => fitMargin([{ isHome: 0, ratingGap: 0, margin: 3 }])).toThrow("degenerate margin fit");
    });
  });

  describe("correlation", () => {
    it("is 1 for a perfect positive relationship", () => {
      const samples = [1, 2, 3].map((x) => ({ isHome: 1, ratingGap: x, margin: 7 * x - 1 }));
      expect(correlation(samples)).toBeCloseTo(1, 12);
    });

    it("is -1 for a perfect negative relationship", () => {
      const samples = [1, 2, 3].map((x) => ({ isHome: 1, ratingGap: x, margin: -x }));
      expect(correlation(samples)).toBeCloseTo(-1, 12);
    });
  });

  describe("scoreFeatureConfig", () => {
    const random = seededRandom(8);
    const teamGames = syntheticTeamGames([2022, 2023]);
    const games: WeekGame[] = schedule([2022, 2023]).map((m) => ({
      gameId: m.gameId,
      season: m.season,
      week: m.week,
      gameType: "REG",
      home: m.home,
      away: m.away,
      neutralSite: false,
      spreadLine: null,
      totalLine: null,
      homeMoneyline: null,
      awayMoneyline: null,
      homeScore: 10 + Math.floor(random() * 25),
      awayScore: 10 + Math.floor(random() * 25),
    }));

    it("builds one sample per completed game", () => {
      expect(marginSamples(teamGames, games, DEFAULT_FEATURE_CONFIG)).toHaveLength(games.length);
    });

    it("fits the margin line on the tuning seasons only", () => {
      const score = scoreFeatureConfig(teamGames, games, DEFAULT_FEATURE_CONFIG, [2022], [2023]);
      const tuneOnly = marginSamples(teamGames, games, DEFAULT_FEATURE_CONFIG).filter((s) => s.season === 2022);
      expect(score.fit).toEqual(fitMargin(tuneOnly));
    });

    it("scores the held-out seasons with the tuning fit", () => {
      const score = scoreFeatureConfig(teamGames, games, DEFAULT_FEATURE_CONFIG, [2022], [2023]);
      const heldOut = marginSamples(teamGames, games, DEFAULT_FEATURE_CONFIG).filter((s) => s.season === 2023);
      expect(score.validateRmse).toBeCloseTo(rmse(heldOut, score.fit), 12);
    });
  });
});
