import { describe, expect, it } from "vitest";
import { DEFAULT_QB_SKILL_CONFIG, createQbSkillModel, priorOffset } from "../../src/features/qbSkill";
import type { QbDropbacks } from "../../src/types/injuries";

const config = DEFAULT_QB_SKILL_CONFIG;
const game = (week: number, playerId: string, dropbacks: number, epaPerDropback: number, season = 2024): QbDropbacks => ({
  season,
  week,
  playerId,
  team: "BUF",
  dropbacks,
  epa: dropbacks * epaPerDropback,
});
const history = [1, 2, 3, 4].flatMap((week) => [game(week, "00-000000A", 35, 0.2), game(week, "00-000000B", 35, -0.1)]);
const target = { season: 2024, week: 5 };

describe("features/qbSkill", () => {
  describe("priorOffset", () => {
    it("expects less from later draft picks early in a career", () => {
      const round = (draftRound: number | null) => priorOffset({ draftRound, rookieSeason: 2024 }, 2024, config);
      expect(round(1)).toBeGreaterThan(round(3));
      expect(round(3)).toBeGreaterThan(round(6));
      expect(round(6)).toBeGreaterThan(round(null));
    });

    it("uses the veteran offset once a QB is experienced", () => {
      expect(priorOffset({ draftRound: 7, rookieSeason: 2019 }, 2024, config)).toBe(config.offsets.veteran);
    });

    it("treats a QB without a profile as a veteran", () => {
      expect(priorOffset(undefined, 2024, config)).toBe(config.offsets.veteran);
    });
  });

  describe("createQbSkillModel", () => {
    const model = createQbSkillModel(history, new Map(), config);

    it("averages league EPA per dropback from earlier games", () => {
      expect(model.league(target)).toBeCloseTo(0.05, 9);
    });

    it("rates a better passer above a worse one", () => {
      expect(model.skill("00-000000A", target)).toBeGreaterThan(model.skill("00-000000B", target));
    });

    it("regresses a short record toward the prior", () => {
      expect(model.skill("00-000000A", target)).toBeLessThan(0.2);
      expect(model.skill("00-000000A", target)).toBeGreaterThan(model.league(target));
    });

    it("rates an unseen QB at his prior", () => {
      expect(model.skill("00-000000Z", target)).toBeCloseTo(model.league(target) + config.offsets.veteran, 9);
    });

    it("rates an unseen first-round rookie above an unseen undrafted one", () => {
      const profiles = new Map([
        ["00-000000R", { draftRound: 1, rookieSeason: 2024 }],
        ["00-000000U", { draftRound: null, rookieSeason: 2024 }],
      ]);
      const withProfiles = createQbSkillModel(history, profiles, config);
      expect(withProfiles.skill("00-000000R", target)).toBeGreaterThan(withProfiles.skill("00-000000U", target));
    });

    it("weights recent games more heavily", () => {
      const improving = [game(1, "00-000000C", 35, -0.3), game(2, "00-000000C", 35, 0.3)];
      const declining = [game(1, "00-000000C", 35, 0.3), game(2, "00-000000C", 35, -0.3)];
      const at = { season: 2024, week: 3 };
      expect(createQbSkillModel(improving, new Map(), config).skill("00-000000C", at)).toBeGreaterThan(
        createQbSkillModel(declining, new Map(), config).skill("00-000000C", at),
      );
    });

    it("rates replacement level below the league", () => {
      expect(model.replacement(target)).toBeCloseTo(model.league(target) + config.replacement, 9);
    });

    describe("no future data", () => {
      it("is unchanged by games in or after the target week", () => {
        const future = [...history, game(5, "00-000000A", 50, -1), game(6, "00-000000B", 50, 1)];
        const poisoned = createQbSkillModel(future, new Map(), config);
        expect(poisoned.skill("00-000000A", target)).toBe(model.skill("00-000000A", target));
        expect(poisoned.league(target)).toBe(model.league(target));
      });
    });
  });
});
