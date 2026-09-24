import { describe, expect, it } from "vitest";
import { fitOpponentAdjusted, type Observation } from "../../src/features/opponentAdjust";

const teams = ["A", "B", "C", "D"];
const noPrior = { intercept: 0, offense: new Map<string, number>(), defense: new Map<string, number>() };
const tiny = { intercept: 0, offense: 1e-6, defense: 1e-6 };

describe("features/opponentAdjust", () => {
  describe("fitOpponentAdjusted", () => {
    describe("with noise-free round-robin data and negligible penalty", () => {
      const trueOffense = { A: 0.2, B: 0.05, C: -0.1, D: -0.15 };
      const trueDefense = { A: -0.1, B: 0.15, C: 0.05, D: -0.1 };
      const league = 0.02;
      const observations: Observation[] = teams.flatMap((off) =>
        teams
          .filter((def) => def !== off)
          .map((def) => ({
            offense: off,
            defense: def,
            epaPerPlay:
              league +
              trueOffense[off as keyof typeof trueOffense] +
              trueDefense[def as keyof typeof trueDefense],
            weight: 60,
          })),
      );
      const fit = fitOpponentAdjusted(observations, teams, noPrior, tiny);

      it("recovers the league intercept", () => {
        expect(fit.intercept).toBeCloseTo(league, 6);
      });

      it("recovers each offense", () => {
        for (const team of teams) {
          expect(fit.offense.get(team)).toBeCloseTo(trueOffense[team as keyof typeof trueOffense], 6);
        }
      });

      it("recovers each defense", () => {
        for (const team of teams) {
          expect(fit.defense.get(team)).toBeCloseTo(trueDefense[team as keyof typeof trueDefense], 6);
        }
      });
    });

    describe("opponent adjustment", () => {
      // A and B post the same raw EPA/play, but A faced the stingy defense.
      const observations: Observation[] = [
        { offense: "A", defense: "C", epaPerPlay: 0.1, weight: 60 },
        { offense: "B", defense: "D", epaPerPlay: 0.1, weight: 60 },
        { offense: "D", defense: "C", epaPerPlay: -0.3, weight: 60 },
        { offense: "C", defense: "D", epaPerPlay: 0.3, weight: 60 },
      ];
      const fit = fitOpponentAdjusted(observations, teams, noPrior, {
        intercept: 1,
        offense: 100,
        defense: 100,
      });

      it("rates the offense that faced the tougher defense higher", () => {
        expect(fit.offense.get("A")!).toBeGreaterThan(fit.offense.get("B")!);
      });

      it("rates the defense that allowed less as better (lower)", () => {
        expect(fit.defense.get("C")!).toBeLessThan(fit.defense.get("D")!);
      });
    });

    describe("with no observations", () => {
      const prior = {
        intercept: 0.03,
        offense: new Map([["A", 0.1]]),
        defense: new Map([["B", -0.05]]),
      };
      const fit = fitOpponentAdjusted([], teams, prior, { intercept: 1, offense: 300, defense: 600 });

      it("returns the prior intercept", () => {
        expect(fit.intercept).toBeCloseTo(0.03);
      });

      it("returns each team's prior", () => {
        expect(fit.offense.get("A")).toBeCloseTo(0.1);
        expect(fit.defense.get("B")).toBeCloseTo(-0.05);
      });

      it("defaults teams without a prior to league average", () => {
        expect(fit.offense.get("C")).toBeCloseTo(0);
      });
    });

    describe("penalty strength", () => {
      const observations: Observation[] = [{ offense: "A", defense: "B", epaPerPlay: 0.5, weight: 60 }];
      const fitWith = (penalty: number) =>
        fitOpponentAdjusted(observations, teams, noPrior, {
          intercept: 1e6,
          offense: penalty,
          defense: penalty,
        }).offense.get("A")!;

      it("shrinks harder toward the prior as the penalty grows", () => {
        expect(fitWith(10)).toBeGreaterThan(fitWith(1000));
      });

      it("pins ratings to the prior under an overwhelming penalty", () => {
        expect(fitWith(1e9)).toBeCloseTo(0, 6);
      });
    });

    describe("input handling", () => {
      it("ignores observations with zero weight", () => {
        const withZero = fitOpponentAdjusted(
          [{ offense: "A", defense: "B", epaPerPlay: 9, weight: 0 }],
          teams,
          noPrior,
          { intercept: 1, offense: 100, defense: 100 },
        );
        expect(withZero.offense.get("A")).toBeCloseTo(0);
      });

      it("throws for a team outside the team list", () => {
        expect(() =>
          fitOpponentAdjusted([{ offense: "Z", defense: "A", epaPerPlay: 0, weight: 1 }], teams, noPrior, tiny),
        ).toThrow("unknown team: Z");
      });
    });
  });
});
