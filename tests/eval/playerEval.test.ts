import { describe, expect, it } from "vitest";
import { evaluatePlayers, trailingBaseline, type PlayerEvalRow } from "../../src/eval/playerEval";
import type { PlayerProjection, StatSummary } from "../../src/types/players";
import { playerGame } from "../fixtures/players";

const summary = (mean: number, p10: number, p90: number): StatSummary => ({ mean, p10, p50: mean, p90 });

function projection(overrides: Partial<PlayerProjection>): PlayerProjection {
  return {
    gameId: "G",
    playerId: "00-0000002",
    name: "WR1",
    position: "WR",
    team: "BUF",
    opponent: "NE",
    starterQb: false,
    targets: 8,
    carries: 0,
    receptions: summary(5, 2, 8),
    recYards: summary(60, 20, 110),
    rushYards: summary(0, 0, 0),
    passYards: summary(0, 0, 0),
    passTds: 0,
    interceptions: 0,
    touchdowns: summary(0.4, 0, 1),
    anytimeTdProb: 0.35,
    ...overrides,
  };
}

const baseline = { receptions: 4, recYards: 50, rushYards: 0 };
const rows: PlayerEvalRow[] = [
  { projection: projection({}), actual: playerGame({ playerId: "00-0000002", week: 5, receptions: 6, recYards: 80, recTds: 1 }), baseline },
  { projection: projection({ playerId: "00-0000003" }), actual: playerGame({ playerId: "00-0000003", week: 5, receptions: 9, recYards: 150 }), baseline },
  { projection: projection({ playerId: "00-0000004" }), actual: null, baseline },
];

describe("eval/playerEval", () => {
  describe("trailingBaseline", () => {
    const games = [1, 2, 3, 4, 5, 6].map((week) => playerGame({ playerId: "00-0000002", week, recYards: week * 10, receptions: week }));

    it("averages the player's last four games before the target", () => {
      expect(trailingBaseline(games, "00-0000002", { season: 2024, week: 6 })).toMatchObject({ recYards: 35, receptions: 3.5 });
    });

    it("never uses the target week or later", () => {
      expect(trailingBaseline(games, "00-0000002", { season: 2024, week: 3 }).recYards).toBe(15);
    });

    it("is zero for a player without history", () => {
      expect(trailingBaseline(games, "00-0000099", { season: 2024, week: 6 })).toEqual({ receptions: 0, recYards: 0, rushYards: 0 });
    });
  });

  describe("evaluatePlayers", () => {
    const report = evaluatePlayers(rows);

    it("counts projected and appeared players", () => {
      expect(report).toMatchObject({ projected: 3, appeared: 2 });
    });

    it("measures p10-p90 coverage over players who appeared", () => {
      expect(report.recYards).toMatchObject({ games: 2, absent: 1, coverage: 0.5 });
    });

    it("also measures coverage counting absent players as zero", () => {
      expect(report.recYards.coverageAbsentAsZero).toBeCloseTo(1 / 3);
    });

    it("compares model and baseline errors on appeared players", () => {
      expect(report.recYards.mae).toBe((20 + 90) / 2);
      expect(report.recYards.baselineMae).toBe((30 + 100) / 2);
    });

    it("reports mean actual both ways", () => {
      expect(report.recYards.meanActual).toBe(115);
      expect(report.recYards.meanActualAbsentAsZero).toBeCloseTo(230 / 3);
    });

    it("skips rushing for players below the carry threshold", () => {
      expect(report.rushYards.games).toBe(0);
    });

    it("buckets anytime-TD predictions against outcomes", () => {
      const bucket = report.anytimeTd.find((b) => b.games > 0)!;
      expect(bucket).toMatchObject({ games: 2, actualRate: 0.5 });
    });
  });
});
