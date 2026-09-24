import { describe, expect, it, vi } from "vitest";
import type { FeatureModel } from "../../src/features/teamFeatures";
import { buildMatchup, createWeekFeatureCache, ratingLookupFrom, teamsBySeason } from "../../src/sim/matchups";
import type { TeamWeekFeatures } from "../../src/types/features";
import type { WeekGame } from "../../src/types/sim";

function features(team: string, offense: number, defense: number, playsPerGame: number): TeamWeekFeatures {
  return {
    season: 2025,
    week: 5,
    team,
    gamesPlayed: 4,
    offense: { all: offense, pass: 0, rush: 0 },
    defense: { all: defense, pass: 0, rush: 0 },
    league: { all: 0, pass: 0, rush: 0 },
    playsPerGame,
    neutralPassRate: 0.5,
  };
}

const week = new Map([
  ["LA", features("LA", 0.1, -0.02, 66)],
  ["SF", features("SF", 0.04, 0.03, 62)],
]);

const game: WeekGame = {
  gameId: "2025_05_SF_LA",
  season: 2025,
  week: 5,
  gameType: "REG",
  kickoff: null,
  home: "LA",
  away: "SF",
  neutralSite: false,
  spreadLine: 8.5,
  totalLine: 43.5,
  homeMoneyline: -400,
  awayMoneyline: 310,
  homeScore: null,
  awayScore: null,
};

describe("sim/matchups", () => {
  describe("buildMatchup", () => {
    it("takes each side's overall offense, defense and pace", () => {
      expect(buildMatchup(week, game).home).toEqual({ team: "LA", offense: 0.1, defense: -0.02, playsPerGame: 66 });
    });

    it("uses the week's average pace as the league pace", () => {
      expect(buildMatchup(week, game).leaguePlaysPerGame).toBe(64);
    });

    it("marks playoff games as postseason", () => {
      expect(buildMatchup(week, { ...game, gameType: "WC" }).postseason).toBe(true);
    });

    it("carries the neutral-site flag", () => {
      expect(buildMatchup(week, { ...game, neutralSite: true }).neutralSite).toBe(true);
    });

    it("throws for a team without features", () => {
      expect(() => buildMatchup(week, { ...game, away: "NYJ" })).toThrow("no features for NYJ in 2025 week 5");
    });
  });

  describe("createWeekFeatureCache", () => {
    const setup = () => {
      const model: FeatureModel = { featuresAt: vi.fn(() => [...week.values()]) };
      return { model, cache: createWeekFeatureCache(model, new Map([[2025, ["LA", "SF"]]])) };
    };

    it("computes each week once", () => {
      const { model, cache } = setup();
      cache({ season: 2025, week: 5 });
      cache({ season: 2025, week: 5 });
      expect(model.featuresAt).toHaveBeenCalledTimes(1);
    });

    it("passes the season's team list to the feature model", () => {
      const { model, cache } = setup();
      cache({ season: 2025, week: 5 });
      expect(model.featuresAt).toHaveBeenCalledWith({ season: 2025, week: 5 }, ["LA", "SF"]);
    });
  });

  describe("ratingLookupFrom", () => {
    it("returns the overall offense and defense ratings", () => {
      const lookup = ratingLookupFrom(() => week);
      expect(lookup({ season: 2025, week: 5 }, "SF")).toEqual({ offense: 0.04, defense: 0.03 });
    });
  });

  describe("teamsBySeason", () => {
    it("merges teams that played with teams on the schedule, sorted per season", () => {
      const result = teamsBySeason(
        [
          { season: 2025, team: "SF" },
          { season: 2024, team: "KC" },
        ],
        [game, { ...game, season: 2024, home: "BUF", away: "KC" }],
      );
      expect([...result]).toEqual([
        [2025, ["LA", "SF"]],
        [2024, ["BUF", "KC"]],
      ]);
    });
  });
});
