import { describe, expect, it } from "vitest";
import { adjustPassRate } from "../../src/players/teamStats";
import type { TeamGameStats } from "../../src/types/sim";

const stats: TeamGameStats = {
  passAttempts: 30,
  completions: 20,
  passYards: 210,
  passTds: 2,
  interceptions: 1,
  targets: 28,
  carries: 30,
  rushYards: 120,
  rushTds: 1,
};

describe("players/teamStats", () => {
  describe("adjustPassRate", () => {
    const passier = adjustPassRate(stats, 0.1);

    it("keeps total plays fixed", () => {
      expect(passier.passAttempts + passier.carries).toBe(60);
    });

    it("moves plays toward passing for a pass-heavy team", () => {
      expect(passier.passAttempts).toBe(36);
    });

    it("keeps yards per attempt and per carry", () => {
      expect(passier.passYards / passier.passAttempts).toBeCloseTo(7);
      expect(passier.rushYards / passier.carries).toBeCloseTo(4);
    });

    it("keeps touchdowns and interceptions", () => {
      expect(passier).toMatchObject({ passTds: 2, rushTds: 1, interceptions: 1 });
    });

    it("keeps completions within targets and at least equal to passing touchdowns", () => {
      const runHeavy = adjustPassRate({ ...stats, completions: 2, passTds: 2, targets: 3, passAttempts: 3 }, -0.4);
      expect(runHeavy.completions).toBeGreaterThanOrEqual(runHeavy.passTds);
      expect(runHeavy.completions).toBeLessThanOrEqual(runHeavy.targets);
    });

    it("is a no-op for a league-average team", () => {
      expect(adjustPassRate(stats, 0)).toBe(stats);
    });

    it("leaves a box score without both passes and runs alone", () => {
      const noRuns = { ...stats, carries: 0, rushYards: 0 };
      expect(adjustPassRate(noRuns, 0.1)).toBe(noRuns);
    });
  });
});
