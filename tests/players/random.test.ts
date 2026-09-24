import { describe, expect, it } from "vitest";
import { sampleGamma, sampleNormal, sampleWeighted } from "../../src/players/random";
import { createRng } from "../../src/sim/rng";

function moments(draw: () => number, n = 40_000) {
  const values = Array.from({ length: n }, draw);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, variance, min: Math.min(...values) };
}

describe("players/random", () => {
  describe("sampleNormal", () => {
    it("has mean 0 and variance 1", () => {
      const rng = createRng(1);
      const m = moments(() => sampleNormal(rng));
      expect(m.mean).toBeCloseTo(0, 1);
      expect(m.variance).toBeCloseTo(1, 1);
    });
  });

  describe("sampleGamma", () => {
    it.each([0.5, 3, 20])("matches mean shape*scale and variance shape*scale^2 for shape %d", (shape) => {
      const rng = createRng(2);
      const m = moments(() => sampleGamma(shape, 2, rng));
      expect(m.mean / (shape * 2)).toBeCloseTo(1, 1);
      expect(m.variance / (shape * 4)).toBeCloseTo(1, 1);
    });

    it("never returns a negative value", () => {
      const rng = createRng(3);
      expect(moments(() => sampleGamma(0.3, 1, rng), 5000).min).toBeGreaterThanOrEqual(0);
    });

    it("returns zero for a non-positive shape", () => {
      expect(sampleGamma(0, 1, createRng(4))).toBe(0);
    });
  });

  describe("sampleWeighted", () => {
    it("draws indices in proportion to unnormalized weights", () => {
      const rng = createRng(5);
      const counts = [0, 0];
      for (let i = 0; i < 20_000; i++) counts[sampleWeighted([3, 1], rng)]!++;
      expect(counts[0]! / 20_000).toBeCloseTo(0.75, 1);
    });

    it("returns -1 when every weight is zero", () => {
      expect(sampleWeighted([0, 0], createRng(6))).toBe(-1);
    });
  });
});
