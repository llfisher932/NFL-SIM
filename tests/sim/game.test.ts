import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CONFIG } from "../../src/sim/config";
import type { DriveModel } from "../../src/sim/driveModel";
import { matchupEpa, simulateGame } from "../../src/sim/game";
import { createRng } from "../../src/sim/rng";
import { DRIVE_OUTCOMES, type DriveOutcome, type Matchup } from "../../src/types/sim";

interface StubLog {
  offenseMatchups: number[];
  paceScales: number[];
}

function scriptedModel(script: (drive: number) => DriveOutcome, durationSeconds = 150): DriveModel & StubLog {
  let drive = 0;
  const log: StubLog = { offenseMatchups: [], paceScales: [] };
  return {
    ...log,
    trainingDrives: 0,
    outcomeModel: { classes: 0, features: 0, coefficients: [] },
    outcomeProbabilities: (_start, matchup) => {
      log.offenseMatchups.push(matchup);
      const outcome = script(drive++);
      return DRIVE_OUTCOMES.map((o) => (o === outcome ? 1 : 0));
    },
    sampleDrive: (_outcome, _start, secondsLeft, paceScale) => {
      log.paceScales.push(paceScale);
      return durationSeconds * paceScale <= secondsLeft ? { endYardline: 50, durationSeconds } : null;
    },
    sampleNextStart: () => 75,
    sampleKickoffStart: () => 70,
    sampleTouchdownPoints: () => 7,
  };
}

const evenMatchup: Matchup = {
  home: { team: "HOME", offense: 0.05, defense: -0.02, playsPerGame: 64 },
  away: { team: "AWAY", offense: -0.01, defense: 0.03, playsPerGame: 64 },
  neutralSite: false,
  postseason: false,
  leaguePlaysPerGame: 64,
};

const config = { ...DEFAULT_SIM_CONFIG, homeFieldEpa: 0.02 };

describe("sim/game", () => {
  describe("matchupEpa", () => {
    it("adds home-field advantage to the home offense", () => {
      expect(matchupEpa(evenMatchup, "home", 0.02)).toBeCloseTo(0.05 + 0.03 + 0.02);
    });

    it("subtracts home-field advantage from the away offense", () => {
      expect(matchupEpa(evenMatchup, "away", 0.02)).toBeCloseTo(-0.01 - 0.02 - 0.02);
    });

    it("ignores home-field advantage at a neutral site", () => {
      expect(matchupEpa({ ...evenMatchup, neutralSite: true }, "home", 0.02)).toBeCloseTo(0.08);
    });
  });

  describe("simulateGame", () => {
    describe("scoring", () => {
      it("credits touchdowns to the offense and alternates possession", () => {
        const result = simulateGame(scriptedModel(() => "touchdown"), evenMatchup, config, createRng(1));
        expect(result.homeScore % 7).toBe(0);
        expect(result.awayScore % 7).toBe(0);
        expect(Math.abs(result.homeScore - result.awayScore)).toBeLessThanOrEqual(7);
      });

      it("credits field goals as three points", () => {
        const model = scriptedModel((i) => (i === 0 ? "field_goal" : "punt"));
        const result = simulateGame(model, evenMatchup, config, createRng(1));
        expect(result.homeScore + result.awayScore).toBe(3);
      });

      it("credits an opponent touchdown to the defense, which then kicks off to the same offense", () => {
        const model = scriptedModel((i) => (i === 0 ? "opp_touchdown" : "punt"));
        const result = simulateGame(model, evenMatchup, config, createRng(1));
        expect(result.homeScore + result.awayScore).toBe(7);
        expect(model.offenseMatchups[0]).toBe(model.offenseMatchups[1]);
      });

      it("credits a safety as two points to the defense", () => {
        const model = scriptedModel((i) => (i === 0 ? "safety" : "punt"));
        const result = simulateGame(model, evenMatchup, config, createRng(1));
        expect(result.homeScore + result.awayScore).toBe(2);
      });
    });

    describe("clock", () => {
      it("fits the number of drives to the time available", () => {
        const result = simulateGame(scriptedModel(() => "punt", 150), evenMatchup, config, createRng(1));
        expect(result.drives).toBe(12 + 12 + 4);
      });

      it("ends the half when the drawn outcome is end of half", () => {
        const model = scriptedModel(() => "end_of_half");
        const result = simulateGame(model, evenMatchup, config, createRng(1));
        expect(result.drives).toBe(3);
      });

      it("passes a faster offense a smaller pace scale", () => {
        const fast = { ...evenMatchup, home: { ...evenMatchup.home, playsPerGame: 80 } };
        const model = scriptedModel(() => "punt");
        simulateGame(model, fast, config, createRng(1));
        expect(Math.min(...model.paceScales)).toBeCloseTo(64 / 80);
      });
    });

    describe("overtime", () => {
      it("ends a scoreless regular-season game in a tie after one period", () => {
        const result = simulateGame(scriptedModel(() => "punt"), evenMatchup, config, createRng(1));
        expect(result).toMatchObject({ homeScore: 0, awayScore: 0, overtime: true });
      });

      it("gives the second team a possession after an opening field goal", () => {
        const model = scriptedModel((i) => (i >= 24 && i <= 26 ? (["field_goal", "punt", "touchdown"] as const)[i - 24]! : "punt"));
        const result = simulateGame(model, evenMatchup, config, createRng(1));
        expect(result.homeScore + result.awayScore).toBe(3);
        expect(result.drives).toBe(26);
      });

      it("ends immediately on a defensive score", () => {
        const model = scriptedModel((i) => (i === 24 ? "safety" : "punt"));
        const result = simulateGame(model, evenMatchup, config, createRng(1));
        expect(result.drives).toBe(25);
        expect(result.homeScore + result.awayScore).toBe(2);
      });

      it("keeps playing postseason periods until someone scores", () => {
        const model = scriptedModel((i) => (i === 40 ? "field_goal" : "punt"));
        const result = simulateGame(model, { ...evenMatchup, postseason: true }, config, createRng(1));
        expect(result.homeScore + result.awayScore).toBe(3);
      });

      it("skips overtime when regulation is decided", () => {
        const model = scriptedModel((i) => (i === 0 ? "touchdown" : "punt"));
        expect(simulateGame(model, evenMatchup, config, createRng(1)).overtime).toBe(false);
      });
    });

    describe("reproducibility", () => {
      it("gives identical results for identical seeds", () => {
        const random = (seed: number) => {
          const pick = createRng(seed);
          return simulateGame(scriptedModel(() => DRIVE_OUTCOMES[pick.int(8)]!), evenMatchup, config, createRng(seed));
        };
        expect(random(5)).toEqual(random(5));
      });
    });
  });
});
