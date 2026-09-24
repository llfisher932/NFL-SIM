import { describe, expect, it } from "vitest";
import {
  brierScore,
  calibrationBuckets,
  homeOutcome,
  lineHitRate,
  logLoss,
  meanAbsoluteError,
} from "../../src/eval/metrics";

describe("eval/metrics", () => {
  describe("homeOutcome", () => {
    it("is 1 for a home win", () => {
      expect(homeOutcome(24, 17)).toBe(1);
    });

    it("is 0 for an away win", () => {
      expect(homeOutcome(17, 24)).toBe(0);
    });

    it("is one half for a tie", () => {
      expect(homeOutcome(20, 20)).toBe(0.5);
    });
  });

  describe("brierScore", () => {
    it("is zero for perfect certainty", () => {
      expect(brierScore([{ probability: 1, outcome: 1 }, { probability: 0, outcome: 0 }])).toBe(0);
    });

    it("is 0.25 for coin-flip forecasts", () => {
      expect(brierScore([{ probability: 0.5, outcome: 1 }, { probability: 0.5, outcome: 0 }])).toBe(0.25);
    });

    it("averages squared errors", () => {
      expect(brierScore([{ probability: 0.8, outcome: 1 }, { probability: 0.3, outcome: 1 }])).toBeCloseTo((0.04 + 0.49) / 2);
    });
  });

  describe("logLoss", () => {
    it("is ln 2 for coin-flip forecasts", () => {
      expect(logLoss([{ probability: 0.5, outcome: 1 }])).toBeCloseTo(Math.LN2);
    });

    it("charges both sides of a tie", () => {
      expect(logLoss([{ probability: 0.8, outcome: 0.5 }])).toBeCloseTo(-(0.5 * Math.log(0.8) + 0.5 * Math.log(0.2)));
    });

    it("stays finite for a confident miss", () => {
      expect(Number.isFinite(logLoss([{ probability: 1, outcome: 0 }]))).toBe(true);
    });
  });

  describe("meanAbsoluteError", () => {
    it("averages absolute differences", () => {
      expect(meanAbsoluteError([{ predicted: 3, actual: 10 }, { predicted: -2, actual: -5 }])).toBe(5);
    });

    it("is NaN for no rows", () => {
      expect(meanAbsoluteError([])).toBeNaN();
    });
  });

  describe("lineHitRate", () => {
    it("counts a hit when the prediction and result fall on the same side of the line", () => {
      expect(lineHitRate([{ predicted: 5, line: 3, actual: 10 }])).toEqual({ hits: 1, decisions: 1 });
    });

    it("counts a miss when they fall on opposite sides", () => {
      expect(lineHitRate([{ predicted: 5, line: 3, actual: 1 }])).toEqual({ hits: 0, decisions: 1 });
    });

    it("excludes pushes", () => {
      expect(lineHitRate([{ predicted: 5, line: 3, actual: 3 }])).toEqual({ hits: 0, decisions: 0 });
    });

    it("excludes predictions exactly on the line", () => {
      expect(lineHitRate([{ predicted: 3, line: 3, actual: 10 }])).toEqual({ hits: 0, decisions: 0 });
    });
  });

  describe("calibrationBuckets", () => {
    const rows = [
      { probability: 0.05, outcome: 0 },
      { probability: 0.62, outcome: 1 },
      { probability: 0.68, outcome: 0 },
      { probability: 1, outcome: 1 },
    ];
    const buckets = calibrationBuckets(rows);

    it("creates evenly spaced buckets", () => {
      expect(buckets.map((b) => [b.lower, b.upper])[6]).toEqual([0.6, 0.7]);
    });

    it("averages predictions and outcomes within a bucket", () => {
      expect(buckets[6]).toMatchObject({ games: 2, meanPredicted: expect.closeTo(0.65), actualRate: 0.5 });
    });

    it("places a probability of exactly 1 in the top bucket", () => {
      expect(buckets[9]!.games).toBe(1);
    });

    it("reports empty buckets with NaN rates", () => {
      expect(buckets[3]).toMatchObject({ games: 0, meanPredicted: Number.NaN, actualRate: Number.NaN });
    });
  });
});
