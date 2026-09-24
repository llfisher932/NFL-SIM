import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYER_CONFIG } from "../../src/players/config";
import { projectPlayers, summarize, type PlayerProjectionInputs } from "../../src/players/project";
import { fitDriveModel } from "../../src/sim/driveModel";
import { simulateGame } from "../../src/sim/game";
import { createRng, hashSeed } from "../../src/sim/rng";
import type { Matchup } from "../../src/types/sim";
import { conversions, fixedRatings, syntheticDrives, testSimConfig } from "../fixtures/drives";
import { usageFor } from "../fixtures/players";

const model = fitDriveModel(
  syntheticDrives([2023, 2024], 10),
  conversions(2023, 1, 90, 5, 5),
  { season: 2024, week: 6 },
  fixedRatings,
  testSimConfig,
);

const matchup: Matchup = {
  home: { team: "BUF", offense: 0.05, defense: -0.02, playsPerGame: 64 },
  away: { team: "NE", offense: -0.03, defense: 0.02, playsPerGame: 64 },
  neutralSite: false,
  postseason: false,
  leaguePlaysPerGame: 64,
};

const home = usageFor(
  [
    { position: "QB", carryShare: 0.1 },
    { targetShare: 0.35, rzTargetShare: 0.4 },
    { position: "RB", targetShare: 0.1, carryShare: 0.7, rzCarryShare: 0.8 },
  ],
  "00-0000001",
);
const away = { ...usageFor([{ targetShare: 0.5 }, { position: "RB", carryShare: 0.8 }]), team: "NE" };

const inputs: PlayerProjectionInputs = {
  gameId: "2024_06_NE_BUF",
  model,
  matchup,
  usage: { home, away },
  passShareDelta: { home: 0, away: 0 },
  simConfig: testSimConfig,
  playerConfig: DEFAULT_PLAYER_CONFIG,
  sims: 400,
  seed: 11,
};

describe("players/project", () => {
  describe("summarize", () => {
    it("reports mean and 10/50/90 percentiles", () => {
      expect(summarize(Float64Array.from([1, 2, 3, 4, 5]))).toEqual({ mean: 3, p10: expect.closeTo(1.4), p50: 3, p90: expect.closeTo(4.6) });
    });
  });

  describe("projectPlayers", () => {
    const projections = projectPlayers(inputs);
    const find = (team: string, id: string) => projections.find((p) => p.team === team && p.playerId === id)!;

    it("projects every player in both rotations", () => {
      expect(projections).toHaveLength(5);
    });

    it("is reproducible from the seed", () => {
      expect(projectPlayers(inputs)).toEqual(projections);
    });

    it("credits the starting QB with exactly the simulated team passing", () => {
      const rng = createRng(hashSeed(inputs.seed, inputs.gameId));
      let passYards = 0;
      for (let i = 0; i < inputs.sims; i++) passYards += simulateGame(model, matchup, testSimConfig, rng).homeStats.passYards;
      expect(find("BUF", "00-0000001").passYards.mean).toBeCloseTo(passYards / inputs.sims, 9);
    });

    it("marks only the starter as the passer", () => {
      expect(projections.filter((p) => p.starterQb).map((p) => p.playerId)).toEqual(["00-0000001"]);
    });

    it("gives the lead receiver more targets than the back", () => {
      expect(find("BUF", "00-0000002").targets).toBeGreaterThan(find("BUF", "00-0000003").targets);
    });

    it("keeps percentiles ordered and TD probability in range", () => {
      for (const p of projections) {
        expect(p.recYards.p10).toBeLessThanOrEqual(p.recYards.p50);
        expect(p.recYards.p50).toBeLessThanOrEqual(p.recYards.p90);
        expect(p.anytimeTdProb).toBeGreaterThanOrEqual(0);
        expect(p.anytimeTdProb).toBeLessThanOrEqual(1);
      }
    });

    it("tilts volume toward passing for a pass-heavy team", () => {
      const passier = projectPlayers({ ...inputs, passShareDelta: { home: 0.15, away: 0 } });
      const wr = (rows: typeof projections) => rows.find((p) => p.playerId === "00-0000002" && p.team === "BUF")!.targets;
      expect(wr(passier)).toBeGreaterThan(wr(projections));
    });
  });
});
