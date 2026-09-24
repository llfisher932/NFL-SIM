import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURE_CONFIG, END_OF_SEASON_WEEK } from "../../src/features/config";
import { buildFeatureTable, featuresAt } from "../../src/features/teamFeatures";
import type { FeatureConfig, TeamGame, TeamWeekFeatures } from "../../src/types/features";
import { syntheticTeamGames, teamGame, TEAMS } from "../fixtures/league";

const config = DEFAULT_FEATURE_CONFIG;

function find(rows: readonly TeamWeekFeatures[], team: string): TeamWeekFeatures {
  const row = rows.find((r) => r.team === team);
  if (!row) throw new Error(`no row for ${team}`);
  return row;
}

function game(week: number, team: string, opponent: string, epaPerPlay: number): TeamGame {
  return teamGame({ week, team, opponent, passEpa: 35 * epaPerPlay, rushEpa: 25 * epaPerPlay });
}

describe("features/teamFeatures", () => {
  describe("featuresAt", () => {
    describe("in week 1 with no prior season", () => {
      const rows = featuresAt([], { season: 2024, week: 1 }, ["BAL", "KC"], config);

      it("returns a row for every listed team", () => {
        expect(rows.map((r) => r.team)).toEqual(["BAL", "KC"]);
      });

      it("rates every unit at league average", () => {
        expect(find(rows, "BAL").offense).toEqual({ all: 0, pass: 0, rush: 0 });
        expect(find(rows, "BAL").defense).toEqual({ all: 0, pass: 0, rush: 0 });
      });

      it("falls back to configured pace defaults", () => {
        expect(find(rows, "KC").playsPerGame).toBe(config.playsPerGame.fallback);
        expect(find(rows, "KC").neutralPassRate).toBe(config.neutralPassRate.fallback);
      });

      it("reports zero games played", () => {
        expect(find(rows, "KC").gamesPlayed).toBe(0);
      });
    });

    describe("in week 1 with a prior season", () => {
      const history = syntheticTeamGames([2022]);
      const endOf2022 = featuresAt(history, { season: 2022, week: END_OF_SEASON_WEEK }, TEAMS, config);
      const week1 = featuresAt(history, { season: 2023, week: 1 }, TEAMS, config);

      it("starts each offense at its end-of-season rating times offensive retention", () => {
        for (const team of TEAMS) {
          expect(find(week1, team).offense.all).toBeCloseTo(
            config.retention.offense * find(endOf2022, team).offense.all,
            9,
          );
        }
      });

      it("starts each defense at its end-of-season rating times defensive retention", () => {
        for (const team of TEAMS) {
          expect(find(week1, team).defense.pass).toBeCloseTo(
            config.retention.defense * find(endOf2022, team).defense.pass,
            9,
          );
        }
      });

      it("carries over the prior league average", () => {
        expect(find(week1, "KC").league.all).toBeCloseTo(find(endOf2022, "KC").league.all, 6);
      });

      it("regresses pace toward the prior league mean", () => {
        const mean = endOf2022.reduce((sum, t) => sum + t.playsPerGame, 0) / endOf2022.length;
        const team = find(endOf2022, "SF");
        expect(find(week1, "SF").playsPerGame).toBeCloseTo(
          mean + config.playsPerGame.retention * (team.playsPerGame - mean),
          9,
        );
      });
    });

    describe("after a franchise moves", () => {
      const sanDiego = [1, 2, 3, 4].flatMap((week) => [
        teamGame({ season: 2016, week, team: "SD", opponent: "KC", passEpa: 35 * 0.3, rushEpa: 25 * 0.3 }),
        teamGame({ season: 2016, week, team: "KC", opponent: "SD" }),
      ]);
      const endOf2016 = featuresAt(sanDiego, { season: 2016, week: END_OF_SEASON_WEEK }, ["SD", "KC"], config);
      const week1 = featuresAt(sanDiego, { season: 2017, week: 1 }, ["LAC", "KC"], config);

      it("starts the franchise from its rating under the old code", () => {
        expect(find(week1, "LAC").offense.all).toBeCloseTo(config.retention.offense * find(endOf2016, "SD").offense.all, 9);
        expect(find(week1, "LAC").offense.all).toBeGreaterThan(0);
      });
    });

    describe("early-season regression to the mean", () => {
      const opponents = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
      const games = opponents.flatMap((opp, i) => [game(i + 1, "A", opp, 0.3), game(i + 1, opp, "A", 0)]);
      const teams = ["A", ...opponents];
      const ratingAfter = (week: number) => find(featuresAt(games, { season: 2024, week }, teams, config), "A");

      it("shrinks a single strong game well below its raw margin", () => {
        const offense = ratingAfter(2).offense.all;
        expect(offense).toBeGreaterThan(0);
        expect(offense).toBeLessThan(0.15);
      });

      it("moves toward the raw margin as games accumulate", () => {
        expect(ratingAfter(13).offense.all).toBeGreaterThan(ratingAfter(4).offense.all);
      });
    });

    describe("recency weighting", () => {
      const games = [
        game(1, "A", "C", 0.4),
        game(1, "C", "A", 0),
        game(1, "B", "D", -0.4),
        game(1, "D", "B", 0),
        game(2, "A", "D", -0.4),
        game(2, "D", "A", 0),
        game(2, "B", "C", 0.4),
        game(2, "C", "B", 0),
      ];
      const teams = ["A", "B", "C", "D"];

      it("rates the team whose good game was more recent higher", () => {
        const rows = featuresAt(games, { season: 2024, week: 3 }, teams, { ...config, halfLifeWeeks: 1 });
        expect(find(rows, "B").offense.all).toBeGreaterThan(find(rows, "A").offense.all);
      });

      it("treats both orders equally without decay", () => {
        const flat: FeatureConfig = { ...config, halfLifeWeeks: 1e9 };
        const rows = featuresAt(games, { season: 2024, week: 3 }, teams, flat);
        expect(find(rows, "B").offense.all).toBeCloseTo(find(rows, "A").offense.all, 6);
      });
    });

    describe("pass and rush splits", () => {
      const games = [
        teamGame({ week: 1, team: "A", opponent: "B", passEpa: 35 * 0.4, rushEpa: 25 * -0.2 }),
        teamGame({ week: 1, team: "B", opponent: "A" }),
      ];
      const rows = featuresAt(games, { season: 2024, week: 2 }, ["A", "B"], config);

      it("rates the pass offense from pass plays only", () => {
        expect(find(rows, "A").offense.pass).toBeGreaterThan(0);
      });

      it("rates the rush offense from rush plays only", () => {
        expect(find(rows, "A").offense.rush).toBeLessThan(0);
      });

      it("charges the opponent's pass defense for pass EPA allowed", () => {
        expect(find(rows, "B").defense.pass).toBeGreaterThan(0);
      });
    });

    describe("pace", () => {
      const games = [
        teamGame({ week: 1, team: "A", opponent: "B", plays: 80, neutralPlays: 30, neutralPasses: 24 }),
        teamGame({ week: 1, team: "B", opponent: "A", plays: 50, neutralPlays: 30, neutralPasses: 9 }),
      ];
      const rows = featuresAt(games, { season: 2024, week: 2 }, ["A", "B"], config);

      it("moves plays per game from the prior toward the observed value", () => {
        const a = find(rows, "A").playsPerGame;
        expect(a).toBeGreaterThan(config.playsPerGame.fallback);
        expect(a).toBeLessThan(80);
      });

      it("shrinks neutral pass rate by neutral plays observed", () => {
        const expected = (24 + config.neutralPassRate.priorWeight * config.neutralPassRate.fallback) /
          (30 + config.neutralPassRate.priorWeight);
        expect(find(rows, "A").neutralPassRate).toBeCloseTo(expected, 9);
      });

      it("keeps pass-heavy and run-heavy teams on the correct sides of the prior", () => {
        expect(find(rows, "A").neutralPassRate).toBeGreaterThan(config.neutralPassRate.fallback);
        expect(find(rows, "B").neutralPassRate).toBeLessThan(config.neutralPassRate.fallback);
      });
    });

    describe("team list", () => {
      const games = [game(1, "A", "B", 0.1), game(1, "B", "A", 0)];

      it("includes listed teams that have not played yet", () => {
        const rows = featuresAt(games, { season: 2024, week: 2 }, ["A", "B", "C"], config);
        expect(find(rows, "C").gamesPlayed).toBe(0);
      });

      it("adds teams that played but were not listed", () => {
        const rows = featuresAt(games, { season: 2024, week: 2 }, ["A"], config);
        expect(rows.map((r) => r.team)).toEqual(["A", "B"]);
      });

      it("counts games played before the target week", () => {
        const rows = featuresAt(games, { season: 2024, week: 2 }, ["A"], config);
        expect(find(rows, "A").gamesPlayed).toBe(1);
      });
    });
  });

  describe("buildFeatureTable", () => {
    const history = syntheticTeamGames([2022, 2023]);
    const rows = buildFeatureTable(
      history,
      [
        { season: 2022, teams: TEAMS, weeks: [1, 2] },
        { season: 2023, teams: TEAMS, weeks: [1, 5] },
      ],
      config,
    );

    it("covers every season, week and team requested", () => {
      expect(rows).toHaveLength(2 * 2 * TEAMS.length);
    });

    it("matches featuresAt for each target", () => {
      expect(rows.filter((r) => r.season === 2023 && r.week === 5)).toEqual(
        featuresAt(history, { season: 2023, week: 5 }, TEAMS, config),
      );
    });
  });
});
