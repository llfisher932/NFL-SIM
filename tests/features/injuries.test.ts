import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURE_CONFIG } from "../../src/features/config";
import {
  absenceOverrides,
  absenceProbability,
  applyInjuryEffects,
  createInjuryModel,
  DEFAULT_INJURY_CONFIG,
  fitInjuryEffects,
  type InjuryModelInputs,
  type InjuryObservation,
} from "../../src/features/injuries";
import type { SeasonWeek, TeamGame, TeamWeekFeatures } from "../../src/types/features";
import type { AvailabilityReport, PlayerSnap, PositionGroup, TeamAbsence } from "../../src/types/injuries";
import type { WeekGame } from "../../src/types/sim";
import { seededRandom } from "../fixtures/league";

const p = DEFAULT_INJURY_CONFIG.absence;
const report = (overrides: Partial<AvailabilityReport>): AvailabilityReport => ({
  season: 2024,
  week: 5,
  team: "BUF",
  playerId: "00-0000001",
  rosterStatus: "ACT",
  injuryStatus: null,
  ...overrides,
});

describe("features/injuries", () => {
  describe("absenceProbability", () => {
    it("treats any non-active roster status as out", () => {
      expect(absenceProbability(report({ rosterStatus: "INA" }), true, true, p)).toBe(1);
      expect(absenceProbability(report({ rosterStatus: "RES" }), true, true, p)).toBe(1);
    });

    it("treats a player missing from a published roster as almost certainly out", () => {
      expect(absenceProbability(undefined, true, true, p)).toBe(p.offRoster);
    });

    it("treats an active, unlisted player as available", () => {
      expect(absenceProbability(report({}), true, true, p)).toBe(0);
    });

    it("honors an Out designation even when the roster says active", () => {
      expect(absenceProbability(report({ injuryStatus: "Out" }), true, false, p)).toBe(1);
    });

    it("uses the doubtful rate", () => {
      expect(absenceProbability(report({ injuryStatus: "Doubtful" }), false, false, p)).toBe(p.doubtful);
    });

    it("uses a low questionable rate once game-day inactives are known", () => {
      expect(absenceProbability(report({ injuryStatus: "Questionable" }), true, true, p)).toBe(p.questionableGameday);
    });

    it("uses a higher questionable rate before game day", () => {
      expect(absenceProbability(report({ injuryStatus: "Questionable" }), true, false, p)).toBe(p.questionablePregame);
    });

    it("assumes availability without a roster or report", () => {
      expect(absenceProbability(undefined, false, false, p)).toBe(0);
    });
  });

  describe("fitInjuryEffects", () => {
    const truth = { QB: -0.1, RB: 0, WR: -0.02, TE: -0.01, OL: -0.01, DL: 0.01, LB: 0.01, DB: 0.02 };
    const random = seededRandom(21);
    const observations: InjuryObservation[] = Array.from({ length: 400 }, (_, i) => {
      const offense = { QB: random() < 0.15 ? 1 : 0, RB: random(), WR: 2 * random(), TE: random(), OL: 3 * random() };
      const defense = { DL: 2 * random(), LB: random(), DB: 2 * random() };
      const qbValue = offense.QB * 0.2 * random();
      const residual =
        0.01 -
        0.3 * qbValue +
        (Object.keys(offense) as (keyof typeof offense)[]).reduce((s, g) => s + truth[g] * offense[g], 0) +
        (Object.keys(defense) as (keyof typeof defense)[]).reduce((s, g) => s + truth[g] * defense[g], 0);
      return { season: 2024, week: 1, residual, weight: 60, home: i % 2 === 0 ? 1 : -1, offense, defense, qbValue };
    });
    const effects = fitInjuryEffects(observations, 1e-6);

    it("recovers each position group's effect from noise-free data", () => {
      expect(effects.offense.QB).toBeCloseTo(-0.1, 6);
      expect(effects.offense.WR).toBeCloseTo(-0.02, 6);
      expect(effects.defense.DB).toBeCloseTo(0.02, 6);
    });

    it("recovers the extra cost of losing a better quarterback", () => {
      expect(effects.qbValue).toBeCloseTo(-0.3, 6);
    });

    it("recovers the intercept", () => {
      expect(effects.intercept).toBeCloseTo(0.01, 6);
    });

    it("shrinks effects toward zero under a heavy ridge", () => {
      expect(Math.abs(fitInjuryEffects(observations, 1e9).offense.QB)).toBeLessThan(1e-3);
    });

    it("reports the number of observations", () => {
      expect(effects.observations).toBe(400);
    });

    it("records the weighted mean absence as the baseline", () => {
      const mean = observations.reduce((s, o) => s + o.offense.OL, 0) / observations.length;
      expect(effects.baseline.offense.OL).toBeCloseTo(mean, 9);
    });
  });

  describe("applyInjuryEffects", () => {
    const features: TeamWeekFeatures = {
      season: 2024,
      week: 5,
      team: "BUF",
      gamesPlayed: 4,
      offense: { all: 0.1, pass: 0.15, rush: 0.02 },
      defense: { all: -0.05, pass: -0.04, rush: -0.06 },
      league: { all: 0, pass: 0.05, rush: -0.07 },
      playsPerGame: 64,
      neutralPassRate: 0.55,
    };
    const absence: TeamAbsence = {
      season: 2024,
      week: 5,
      team: "BUF",
      offense: { QB: 1, RB: 0, WR: 0.5, TE: 0, OL: 0 },
      defense: { DL: 0, LB: 0, DB: 2 },
      qbValue: 0.1,
      missing: [],
    };
    const effects = {
      intercept: 0,
      home: 0,
      offense: { QB: -0.1, RB: 0, WR: -0.02, TE: 0, OL: 0 },
      defense: { DL: 0, LB: 0, DB: 0.02 },
      qbValue: -0.3,
      baseline: { offense: { QB: 0, RB: 0, WR: 0, TE: 0, OL: 0 }, defense: { DL: 0, LB: 0, DB: 0 }, qbValue: 0 },
      observations: 1,
    };
    const adjusted = applyInjuryEffects(features, absence, effects);

    it("measures absences relative to the training baseline", () => {
      const centered = applyInjuryEffects(features, absence, {
        ...effects,
        baseline: { ...effects.baseline, offense: { ...effects.baseline.offense, WR: 0.5 } },
      });
      expect(centered.offense.all).toBeCloseTo(0.1 - 0.1 - 0.03);
    });

    it("lowers the offense by each missing group's effect and the missing QB quality", () => {
      expect(adjusted.offense.all).toBeCloseTo(0.1 - 0.1 - 0.01 - 0.03);
    });

    it("raises EPA allowed for a depleted defense", () => {
      expect(adjusted.defense.all).toBeCloseTo(-0.05 + 0.04);
    });

    it("leaves the other features alone", () => {
      expect(adjusted).toMatchObject({ playsPerGame: 64, league: features.league, offense: { pass: 0.15 } });
    });
  });

  describe("absenceOverrides", () => {
    const absence: TeamAbsence = {
      season: 2024,
      week: 5,
      team: "BUF",
      offense: { QB: 0, RB: 0, WR: 0, TE: 0, OL: 0 },
      defense: { DL: 0, LB: 0, DB: 0 },
      qbValue: 0,
      missing: [
        { playerId: "00-0000001", group: "WR", role: 0.8, probability: 1 },
        { playerId: "00-0000002", group: "RB", role: 0.5, probability: 0.24 },
        { playerId: "00-0000003", group: "OL", role: 1, probability: 1 },
      ],
    };

    it("rules out likely-absent skill players only", () => {
      expect(absenceOverrides(absence).map((o) => [o.playerId, o.status])).toEqual([["00-0000001", "out"]]);
    });
  });

  describe("createInjuryModel", () => {
    const snap = (week: number, playerId: string, group: PositionGroup, snapPct: number, team = "BUF"): PlayerSnap => ({
      season: 2024,
      week,
      gameId: `2024_0${week}_${team}`,
      team,
      playerId,
      group,
      snapPct,
    });
    const weeks = [1, 2, 3, 4];
    const baseSnaps: PlayerSnap[] = weeks.flatMap((w) => [
      snap(w, "00-000000Q", "QB", 1),
      snap(w, "00-000000W", "WR", 0.9),
      snap(w, "00-000000O", "OL", 1),
      snap(w, "00-000000D", "DL", 0.8, "KC"),
      snap(w, "00-000000K", "QB", 1, "KC"),
      ...(w <= 2 ? [snap(w, "00-000000R", "RB", 0.6)] : [snap(w, "00-000000R", "RB", 0)]),
    ]);
    const teamGames: TeamGame[] = weeks.flatMap((w) =>
      ["BUF", "KC"].map((team) => ({
        gameId: `2024_0${w}_${team}`,
        season: 2024,
        week: w,
        team,
        opponent: team === "BUF" ? "KC" : "BUF",
        passPlays: 35,
        passEpa: team === "BUF" ? 3.5 : 0,
        rushPlays: 25,
        rushEpa: 0,
        plays: 60,
        neutralPlays: 25,
        neutralPasses: 13,
      })),
    );
    const games: WeekGame[] = [];
    const features = (team: string): TeamWeekFeatures => ({
      season: 2024,
      week: 1,
      team,
      gamesPlayed: 0,
      offense: { all: 0, pass: 0, rush: 0 },
      defense: { all: 0, pass: 0, rush: 0 },
      league: { all: 0, pass: 0, rush: 0 },
      playsPerGame: 64,
      neutralPassRate: 0.5,
    });
    const weekFeatures = () => new Map([["BUF", features("BUF")], ["KC", features("KC")]]);

    const dropbacks = (playerId: string, epaPerDropback: number) =>
      weeks.map((week) => ({ season: 2024, week, playerId, dropbacks: 35, epa: 35 * epaPerDropback }));
    const qbDropbacks = [...dropbacks("00-000000Q", 0.25), ...dropbacks("00-000000K", 0.0)];

    function build(
      reports: AvailabilityReport[],
      snaps = baseSnaps,
      published: string[] = [],
      qbs = qbDropbacks,
    ): ReturnType<typeof createInjuryModel> {
      const inputs: InjuryModelInputs = {
        snaps,
        qbDropbacks: qbs,
        availability: { reports, rosterTeamWeeks: new Set(published) },
        teamGames,
        games,
        weekFeatures,
        featureConfig: DEFAULT_FEATURE_CONFIG,
        config: DEFAULT_INJURY_CONFIG,
      };
      return createInjuryModel(inputs);
    }
    const week5: SeasonWeek = { season: 2024, week: 5 };

    it("counts a starting QB ruled out as a full missing QB, less what the rating already absorbed", () => {
      const absence = build([report({ playerId: "00-000000Q", injuryStatus: "Out" })]).absenceAt("BUF", week5);
      expect(absence.offense.QB).toBeCloseTo(1, 9);
      expect(absence.missing.map((m) => m.playerId)).toEqual(["00-000000Q"]);
    });

    it("values a missing QB by his EPA per dropback above replacement", () => {
      const absence = build([report({ playerId: "00-000000Q", injuryStatus: "Out" })]).absenceAt("BUF", week5);
      expect(absence.qbValue).toBeGreaterThan(0.1);
    });

    it("values a missing QB less when he has been worse", () => {
      const out = [report({ playerId: "00-000000Q", injuryStatus: "Out" })];
      const weaker = [...dropbacks("00-000000Q", 0.05), ...dropbacks("00-000000K", 0.0)];
      expect(build(out, baseSnaps, [], weaker).absenceAt("BUF", week5).qbValue).toBeLessThan(
        build(out).absenceAt("BUF", week5).qbValue,
      );
    });

    it("has no QB value to lose when nobody is out", () => {
      expect(build([]).absenceAt("BUF", week5).qbValue).toBe(0);
    });

    it("ignores players who now play for another team", () => {
      const traded = [...baseSnaps, snap(4, "00-000000W", "WR", 0.9, "KC")];
      const absence = build([report({ playerId: "00-000000W", injuryStatus: "Out" })], traded).absenceAt("BUF", week5);
      expect(absence.offense.WR).toBe(0);
    });

    it("credits a returning player whose absence is baked into the rating", () => {
      const absence = build([]).absenceAt("BUF", week5);
      expect(absence.offense.RB).toBeLessThan(0);
    });

    it("discounts a long absence by how much of the rating comes from this season", () => {
      const absence = build([report({ playerId: "00-000000R", injuryStatus: "Out" })]).absenceAt("BUF", week5);
      expect(absence.offense.RB).toBeGreaterThan(0);
      expect(absence.offense.RB).toBeLessThan(0.6);
    });

    it("treats roster-published teams' unlisted regulars as off the roster", () => {
      const absence = build([report({ playerId: "00-000000Q" })], baseSnaps, ["2024:5:BUF"]).absenceAt("BUF", week5);
      expect(absence.offense.WR).toBeCloseTo(0.9 * p.offRoster, 9);
      expect(absence.offense.QB).toBe(0);
    });

    it("assigns defensive players to the defense", () => {
      const absence = build([report({ team: "KC", playerId: "00-000000D", injuryStatus: "Out" })]).absenceAt("KC", week5);
      expect(absence.defense.DL).toBeCloseTo(0.8, 9);
    });

    it("fits effects only on games before the target", () => {
      const model = build([]);
      expect(model.effectsAt({ season: 2024, week: 3 }).observations).toBe(4);
      expect(model.effectsAt(week5).observations).toBe(8);
    });

    describe("no future data", () => {
      it("is unchanged by snaps, reports and games in or after the target week", () => {
        const clean = build([report({ playerId: "00-000000Q", injuryStatus: "Out" })]);
        const futureSnaps = [...baseSnaps, snap(5, "00-000000W", "WR", 0), snap(6, "00-000000Q", "QB", 0.1)];
        const futureReports = [
          report({ playerId: "00-000000Q", injuryStatus: "Out" }),
          report({ week: 6, playerId: "00-000000W", injuryStatus: "Out" }),
        ];
        const futureDropbacks = [...qbDropbacks, { season: 2024, week: 5, playerId: "00-000000Q", dropbacks: 50, epa: -40 }];
        const poisoned = build(futureReports, futureSnaps, [], futureDropbacks);
        expect(poisoned.absenceAt("BUF", week5)).toEqual(clean.absenceAt("BUF", week5));
        expect(poisoned.effectsAt(week5)).toEqual(clean.effectsAt(week5));
      });
    });

    describe("adjust", () => {
      it("returns adjusted features and the absences behind them", () => {
        const adjusted = build([report({ playerId: "00-000000Q", injuryStatus: "Out" })]).adjust(weekFeatures(), week5);
        expect(adjusted.absences.get("BUF")!.offense.QB).toBeCloseTo(1, 9);
        expect([...adjusted.features.keys()]).toEqual(["BUF", "KC"]);
      });
    });
  });
});
