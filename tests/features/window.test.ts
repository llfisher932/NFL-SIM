import { describe, expect, it } from "vitest";
import { decayWeight, isBefore, seasonWindow } from "../../src/features/window";

describe("features/window", () => {
  describe("isBefore", () => {
    it("orders earlier weeks of the same season first", () => {
      expect(isBefore({ season: 2024, week: 3 }, { season: 2024, week: 4 })).toBe(true);
    });

    it("excludes the same week", () => {
      expect(isBefore({ season: 2024, week: 4 }, { season: 2024, week: 4 })).toBe(false);
    });

    it("places any week of an earlier season first", () => {
      expect(isBefore({ season: 2023, week: 22 }, { season: 2024, week: 1 })).toBe(true);
    });

    it("places any week of a later season after", () => {
      expect(isBefore({ season: 2025, week: 1 }, { season: 2024, week: 18 })).toBe(false);
    });
  });

  describe("decayWeight", () => {
    it("is 1 at age zero", () => {
      expect(decayWeight(0, 8)).toBe(1);
    });

    it("halves after one half-life", () => {
      expect(decayWeight(8, 8)).toBeCloseTo(0.5);
    });

    it("quarters after two half-lives", () => {
      expect(decayWeight(16, 8)).toBeCloseTo(0.25);
    });

    it("rejects a negative age", () => {
      expect(() => decayWeight(-1, 8)).toThrow("negative age");
    });
  });

  describe("seasonWindow", () => {
    const items = [
      { season: 2023, week: 17 },
      { season: 2024, week: 1 },
      { season: 2024, week: 3 },
      { season: 2024, week: 4 },
      { season: 2024, week: 5 },
    ];

    it("keeps only earlier weeks of the target season", () => {
      const window = seasonWindow(items, { season: 2024, week: 4 }, 8);
      expect(window.map((w) => w.item)).toEqual([
        { season: 2024, week: 1 },
        { season: 2024, week: 3 },
      ]);
    });

    it("gives last week's games full weight", () => {
      const [, last] = seasonWindow(items, { season: 2024, week: 4 }, 8);
      expect(last?.weight).toBe(1);
    });

    it("decays older games by weeks elapsed, counting byes", () => {
      const [first] = seasonWindow(items, { season: 2024, week: 4 }, 2);
      expect(first?.weight).toBeCloseTo(0.5);
    });

    it("is empty in week 1", () => {
      expect(seasonWindow(items, { season: 2024, week: 1 }, 8)).toEqual([]);
    });
  });
});
