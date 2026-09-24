import { describe, expect, it } from "vitest";
import { regressToward, shrinkRate } from "../../src/features/shrinkage";

describe("features/shrinkage", () => {
  describe("shrinkRate", () => {
    it("returns the prior with no data", () => {
      expect(shrinkRate(0, 0, 0.55, 110)).toBe(0.55);
    });

    it("weights data and prior by their sample sizes", () => {
      expect(shrinkRate(60, 100, 0.5, 100)).toBeCloseTo(0.55);
    });

    it("approaches the observed rate as data grows", () => {
      expect(shrinkRate(60_000, 100_000, 0.5, 100)).toBeCloseTo(0.6, 3);
    });
  });

  describe("regressToward", () => {
    it("keeps the retained fraction of the distance from the mean", () => {
      expect(regressToward(0.2, 0, 0.5)).toBeCloseTo(0.1);
    });

    it("returns the mean with zero retention", () => {
      expect(regressToward(70, 64, 0)).toBe(64);
    });
  });
});
