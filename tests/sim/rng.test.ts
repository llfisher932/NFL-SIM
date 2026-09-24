import { describe, expect, it } from "vitest";
import { createRng, hashSeed, sampleIndex } from "../../src/sim/rng";

const draw = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("sim/rng", () => {
  describe("createRng", () => {
    it("reproduces the same sequence from the same seed", () => {
      expect(draw(42, 100)).toEqual(draw(42, 100));
    });

    it("produces a different sequence from a different seed", () => {
      expect(draw(42, 10)).not.toEqual(draw(43, 10));
    });

    it("returns values in [0, 1)", () => {
      const values = draw(7, 10_000);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...values)).toBeLessThan(1);
    });

    it("has a mean near one half", () => {
      const values = draw(7, 100_000);
      expect(values.reduce((a, b) => a + b, 0) / values.length).toBeCloseTo(0.5, 2);
    });

    it("draws integers within [0, max)", () => {
      const rng = createRng(1);
      const ints = Array.from({ length: 10_000 }, () => rng.int(6));
      expect(new Set(ints)).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    });
  });

  describe("hashSeed", () => {
    it("is stable for the same seed and key", () => {
      expect(hashSeed(1, "2025_05_SF_LA")).toBe(hashSeed(1, "2025_05_SF_LA"));
    });

    it("differs across keys", () => {
      expect(hashSeed(1, "2025_05_SF_LA")).not.toBe(hashSeed(1, "2025_05_DET_CIN"));
    });

    it("differs across base seeds", () => {
      expect(hashSeed(1, "2025_05_SF_LA")).not.toBe(hashSeed(2, "2025_05_SF_LA"));
    });
  });

  describe("sampleIndex", () => {
    it("draws indices in proportion to their probabilities", () => {
      const rng = createRng(9);
      const counts = [0, 0, 0];
      for (let i = 0; i < 100_000; i++) counts[sampleIndex([0.2, 0.5, 0.3], rng)]!++;
      expect(counts.map((c) => c / 100_000)).toEqual([
        expect.closeTo(0.2, 2),
        expect.closeTo(0.5, 2),
        expect.closeTo(0.3, 2),
      ]);
    });

    it("never draws a zero-probability index", () => {
      const rng = createRng(9);
      for (let i = 0; i < 1000; i++) expect(sampleIndex([0.5, 0, 0.5], rng)).not.toBe(1);
    });
  });
});
