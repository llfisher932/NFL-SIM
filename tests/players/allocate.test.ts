import { describe, expect, it } from "vitest";
import { allocateGame, gameShares } from "../../src/players/allocate";
import { DEFAULT_PLAYER_CONFIG } from "../../src/players/config";
import { createRng } from "../../src/sim/rng";
import type { TeamGameStats } from "../../src/types/sim";
import { usageFor } from "../fixtures/players";

const stats: TeamGameStats = {
  passAttempts: 34,
  completions: 22,
  passYards: 250,
  passTds: 2,
  interceptions: 1,
  targets: 32,
  carries: 26,
  rushYards: 118,
  rushTds: 1,
};

const usage = usageFor([
  { targetShare: 0.3, rzTargetShare: 0.35 },
  { targetShare: 0.2 },
  { targetShare: 0.15, carryShare: 0.6, rzCarryShare: 0.7, position: "RB" },
  { carryShare: 0.2, position: "QB" },
]);

const allocations = Array.from({ length: 300 }, (_, i) => allocateGame(stats, usage, DEFAULT_PLAYER_CONFIG, createRng(i)));
const everyone = (a: (typeof allocations)[number]) => [...a.players, a.other];
const total = (a: (typeof allocations)[number], key: keyof (typeof a)["other"]) => everyone(a).reduce((s, l) => s + l[key], 0);

describe("players/allocate", () => {
  describe("gameShares", () => {
    it("returns expected shares plus the remainder when volatility is zero", () => {
      expect(gameShares([0.5, 0.3], 0, createRng(1))).toEqual([0.5, 0.3, expect.closeTo(0.2)]);
    });

    it("keeps shares near expectation on average with volatility", () => {
      const rng = createRng(2);
      const draws = Array.from({ length: 5000 }, () => gameShares([0.4], 0.5, rng)[0]!);
      expect(draws.reduce((a, b) => a + b, 0) / draws.length).toBeCloseTo(0.4, 1);
    });

    it("never gives volume to a player with zero share", () => {
      expect(gameShares([0, 0.5], 0.5, createRng(3))[0]).toBe(0);
    });
  });

  describe("allocateGame", () => {
    it("hands out every team target", () => {
      expect(allocations.every((a) => total(a, "targets") === stats.targets)).toBe(true);
    });

    it("hands out every completion as a reception", () => {
      expect(allocations.every((a) => total(a, "receptions") === stats.completions)).toBe(true);
    });

    it("never gives a player more receptions than targets", () => {
      expect(allocations.every((a) => everyone(a).every((l) => l.receptions <= l.targets))).toBe(true);
    });

    it("splits all team passing yards among receivers", () => {
      expect(allocations.every((a) => Math.abs(total(a, "recYards") - stats.passYards) < 1e-9)).toBe(true);
    });

    it("gives receiving yards only to players with receptions", () => {
      expect(allocations.every((a) => everyone(a).every((l) => l.receptions > 0 || l.recYards === 0))).toBe(true);
    });

    it("hands out every carry and all rushing yards", () => {
      expect(allocations.every((a) => total(a, "carries") === stats.carries && Math.abs(total(a, "rushYards") - stats.rushYards) < 1e-9)).toBe(true);
    });

    it("credits touchdowns only to players with a catch or carry", () => {
      expect(
        allocations.every(
          (a) =>
            total(a, "recTds") === stats.passTds &&
            total(a, "rushTds") === stats.rushTds &&
            everyone(a).every((l) => (l.recTds === 0 || l.receptions > 0) && (l.rushTds === 0 || l.carries > 0)),
        ),
      ).toBe(true);
    });

    it("gives the larger target share more targets on average", () => {
      const avg = (i: number) => allocations.reduce((s, a) => s + a.players[i]!.targets, 0) / allocations.length;
      expect(avg(0)).toBeGreaterThan(avg(1));
      expect(avg(0)).toBeCloseTo(0.3 * stats.targets, 0);
    });

    it("gives the lead back most carries on average", () => {
      const avg = allocations.reduce((s, a) => s + a.players[2]!.carries, 0) / allocations.length;
      expect(avg).toBeCloseTo(0.6 * stats.carries, -1);
    });
  });
});
