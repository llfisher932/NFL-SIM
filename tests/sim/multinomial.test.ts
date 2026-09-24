import { describe, expect, it } from "vitest";
import { fitMultinomial, softmaxProbabilities, type MultinomialModel } from "../../src/sim/multinomial";
import { createRng, sampleIndex } from "../../src/sim/rng";

describe("sim/multinomial", () => {
  describe("softmaxProbabilities", () => {
    const model: MultinomialModel = {
      classes: 3,
      features: 2,
      coefficients: [
        [0, 0],
        [1, 2],
        [-1, 0.5],
      ],
    };

    it("sums to one", () => {
      const p = softmaxProbabilities(model, [1, 0.3]);
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    });

    it("is uniform when all logits are equal", () => {
      const flat: MultinomialModel = { classes: 3, features: 1, coefficients: [[0], [0], [0]] };
      expect(softmaxProbabilities(flat, [5])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    });

    it("stays finite for large logits", () => {
      const big: MultinomialModel = { classes: 2, features: 1, coefficients: [[1000], [0]] };
      expect(softmaxProbabilities(big, [1])).toEqual([1, 0]);
    });
  });

  describe("fitMultinomial", () => {
    describe("with an intercept only", () => {
      const ys = [...Array(600).fill(0), ...Array(300).fill(1), ...Array(100).fill(2)] as number[];
      const model = fitMultinomial(ys.map(() => [1]), ys, 3, { l2: 1e-6 });

      it("recovers the class frequencies", () => {
        expect(softmaxProbabilities(model, [1])).toEqual([
          expect.closeTo(0.6, 4),
          expect.closeTo(0.3, 4),
          expect.closeTo(0.1, 4),
        ]);
      });
    });

    describe("with a known generating model", () => {
      const truth: MultinomialModel = {
        classes: 3,
        features: 2,
        coefficients: [
          [0, 0],
          [0.5, 1.5],
          [-0.5, -1],
        ],
      };
      const rng = createRng(11);
      const xs = Array.from({ length: 20_000 }, () => [1, rng.next() * 4 - 2]);
      const ys = xs.map((x) => sampleIndex(softmaxProbabilities(truth, x), rng));
      const model = fitMultinomial(xs, ys, 3, { l2: 0.01 });

      it("recovers predicted probabilities across the feature range", () => {
        for (const x of [-2, -1, 0, 1, 2]) {
          const fitted = softmaxProbabilities(model, [1, x]);
          const expected = softmaxProbabilities(truth, [1, x]);
          fitted.forEach((p, k) => expect(p).toBeCloseTo(expected[k]!, 1));
        }
      });

      it("recovers the slope direction of each class", () => {
        const [base, up, down] = model.coefficients.map((row) => row[1]!);
        expect(up! - base!).toBeGreaterThan(1);
        expect(down! - base!).toBeLessThan(-0.5);
      });
    });

    describe("regularization", () => {
      it("pulls probabilities toward uniform under a heavy penalty", () => {
        const ys = [...Array(90).fill(0), ...Array(10).fill(1)] as number[];
        const model = fitMultinomial(ys.map(() => [1]), ys, 2, { l2: 1e6 });
        expect(softmaxProbabilities(model, [1])[0]).toBeCloseTo(0.5, 3);
      });
    });

    describe("input validation", () => {
      it("rejects mismatched rows and labels", () => {
        expect(() => fitMultinomial([[1], [1]], [0], 2, { l2: 1 })).toThrow("invalid training data");
      });

      it("rejects empty data", () => {
        expect(() => fitMultinomial([], [], 2, { l2: 1 })).toThrow("invalid training data");
      });
    });
  });
});
