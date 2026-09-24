import { describe, expect, it } from "vitest";
import { createNearestSampler } from "../../src/sim/nearestSampler";
import { createRng } from "../../src/sim/rng";

const entries = [10, 20, 30, 40, 50, 60, 70, 80].map((key) => ({ key, value: `v${key}` }));

function drawMany(key: number, k: number, n = 2000): Set<string | null> {
  const sampler = createNearestSampler(entries, k);
  const rng = createRng(4);
  return new Set(Array.from({ length: n }, () => sampler.sample(key, rng)));
}

describe("sim/nearestSampler", () => {
  describe("createNearestSampler", () => {
    it("draws only from the k nearest keys", () => {
      expect(drawMany(42, 3)).toEqual(new Set(["v30", "v40", "v50"]));
    });

    it("handles queries below the smallest key", () => {
      expect(drawMany(0, 2)).toEqual(new Set(["v10", "v20"]));
    });

    it("handles queries above the largest key", () => {
      expect(drawMany(99, 2)).toEqual(new Set(["v70", "v80"]));
    });

    it("uses every entry when k exceeds the sample size", () => {
      expect(drawMany(50, 100).size).toBe(entries.length);
    });

    it("returns null when empty", () => {
      expect(createNearestSampler([], 5).sample(10, createRng(1))).toBeNull();
    });

    it("does not depend on input order", () => {
      const shuffled = createNearestSampler([...entries].reverse(), 3);
      const rng = createRng(4);
      const values = new Set(Array.from({ length: 500 }, () => shuffled.sample(42, rng)));
      expect(values).toEqual(new Set(["v30", "v40", "v50"]));
    });
  });
});
