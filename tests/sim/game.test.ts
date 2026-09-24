import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CONFIG } from "../../src/sim/config";
import type { DriveModel } from "../../src/sim/driveModel";
import { matchupEpa, restEdgeEpa, simulateGame } from "../../src/sim/game";
import { createRng } from "../../src/sim/rng";
import { DRIVE_OUTCOMES, type DriveOutcome, type GameState, type Matchup } from "../../src/types/sim";

const DRIVE_STATS = {
  passAttempts: 4,
  completions: 3,
  passYards: 30,
  passTds: 0,
  interceptions: 0,
  targets: 4,
  carries: 2,
  rushYards: 9,
  rushTds: 0,
};

interface StubLog {
  offenseMatchups: number[];
  paceScales: number[];
  states: GameState[];
}

function scriptedModel(script: (drive: number) => DriveOutcome, durationSeconds = 150): DriveModel & StubLog {
  let drive = 0;
  const log: StubLog = { offenseMatchups: [], paceScales: [], states: [] };
  return {
    ...log,
    trainingDrives: 0,
    outcomeModel: { classes: 0, features: 0, coefficients: [] },
    outcomeProbabilities: (_start, matchup, _clock, state) => {
      log.offenseMatchups.push(matchup);
      log.states.push(state);
      const outcome = script(drive++);
      return DRIVE_OUTCOMES.map((o) => (o === outcome ? 1 : 0));
    },
    sampleDrive: (_outcome, _start, secondsLeft, paceScale) => {
      log.paceScales.push(paceScale);
      return durationSeconds * paceScale <= secondsLeft ? { endYardline: 50, durationSeconds, stats: DRIVE_STATS } : null;
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
  describe("restEdgeEpa", () => {
    const restConfig = { restEpaPerDay: 0.002, restCapDays: 7 };

    it("gives the home side an edge per day of extra rest", () => {
      expect(restEdgeEpa({ ...evenMatchup, restDiff: 3 }, restConfig)).toBeCloseTo(0.006, 9);
    });

    it("penalizes the home side for less rest", () => {
      expect(restEdgeEpa({ ...evenMatchup, restDiff: -4 }, restConfig)).toBeCloseTo(-0.008, 9);
    });

    it("caps the rest difference", () => {
      expect(restEdgeEpa({ ...evenMatchup, restDiff: 13 }, restConfig)).toBeCloseTo(0.014, 9);
    });

    it("is zero without rest information", () => {
      expect(restEdgeEpa(evenMatchup, restConfig)).toBe(0);
    });
  });

  describe("matchupEpa", () => {
    it("adds the rest edge to the home side and takes it from the away side", () => {
      expect(matchupEpa(evenMatchup, "home", 0.02, 0.006)).toBeCloseTo(0.05 + 0.03 + 0.026);
      expect(matchupEpa(evenMatchup, "away", 0.02, 0.006)).toBeCloseTo(-0.01 - 0.02 - 0.026);
    });

    it("applies the rest edge at a neutral site", () => {
      expect(matchupEpa({ ...evenMatchup, neutralSite: true }, "home", 0.02, 0.006)).toBeCloseTo(0.086);
    });

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

    describe("team stats", () => {
      it("credits each completed drive's box score to the offense", () => {
        const result = simulateGame(scriptedModel(() => "punt", 150), evenMatchup, config, createRng(1));
        expect(result.homeStats.passAttempts + result.awayStats.passAttempts).toBe(4 * result.drives);
        expect(result.homeStats.rushYards + result.awayStats.rushYards).toBe(9 * result.drives);
      });

      it("credits an end-of-half drive's box score without running more clock", () => {
        const result = simulateGame(scriptedModel(() => "end_of_half"), evenMatchup, config, createRng(1));
        expect(result.homeStats.carries + result.awayStats.carries).toBe(2 * result.drives);
      });

      it("adds nothing when no end-of-half template fits the clock", () => {
        const result = simulateGame(scriptedModel(() => "end_of_half", 5000), evenMatchup, config, createRng(1));
        expect(result.homeStats.passAttempts + result.awayStats.passAttempts).toBe(0);
      });
    });

    describe("game state", () => {
      it("starts the game level with the full clock", () => {
        const model = scriptedModel(() => "punt");
        simulateGame(model, evenMatchup, config, createRng(1));
        expect(model.states[0]).toEqual({ scoreDiff: 0, gameSecondsLeft: 3600 });
      });

      it("shows the next offense trailing after a touchdown", () => {
        const model = scriptedModel((i) => (i === 0 ? "touchdown" : "punt"));
        simulateGame(model, evenMatchup, config, createRng(1));
        expect(model.states[1]!.scoreDiff).toBe(-7);
      });

      it("counts the second half in game seconds without the first half", () => {
        const model = scriptedModel(() => "punt", 150);
        simulateGame(model, evenMatchup, config, createRng(1));
        expect(model.states[12]!.gameSecondsLeft).toBe(1800);
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
