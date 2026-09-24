import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../../src/data/db";
import { FEATURES_TABLE, writeTeamWeekFeatures } from "../../src/data/featureStore";
import { loadSeasonSchedules, loadTeamGames } from "../../src/data/teamGames";
import type { TeamWeekFeatures } from "../../src/types/features";

describe("data/teamGames", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("loadTeamGames", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE pbp AS SELECT * FROM (VALUES
          ('G1', 2024, 1, 'BAL', 'KC', 1, 0, 0.5,  0.5, 1, 900, 1),
          ('G1', 2024, 1, 'BAL', 'KC', 1, 0, -0.1, 0.5, 3, 900, 1),
          ('G1', 2024, 1, 'BAL', 'KC', 0, 1, 0.2,  0.5, 2, 900, 1),
          ('G1', 2024, 1, 'BAL', 'KC', 0, 1, NULL, 0.5, 1, 900, 1),
          ('G1', 2024, 1, 'BAL', 'KC', 1, 0, 0.9,  0.95, 1, 900, 1),
          ('G1', 2024, 1, 'BAL', 'KC', 1, 0, 0.3,  0.5, 1, 60, 2),
          ('G1', 2024, 1, 'BAL', 'KC', 0, 0, 2.0,  0.5, 4, 900, 1),
          ('G1', 2024, 1, NULL,  NULL, 0, 0, NULL, NULL, NULL, 900, 1),
          ('G1', 2024, 1, 'KC',  'BAL', 0, 1, -0.4, 0.5, 1, 900, 1)
        ) AS t(game_id, season, week, posteam, defteam, pass, rush, epa, wp, down, half_seconds_remaining, qtr)`);
    });

    it("returns one row per offense per game", async () => {
      const games = await loadTeamGames(db.connection);
      expect(games.map((g) => `${g.team}-${g.opponent}`)).toEqual(["BAL-KC", "KC-BAL"]);
    });

    describe("for the BAL offense", () => {
      const bal = async () => (await loadTeamGames(db.connection)).find((g) => g.team === "BAL")!;

      it("counts pass plays with EPA and sums their EPA", async () => {
        const g = await bal();
        expect(g.passPlays).toBe(4);
        expect(g.passEpa).toBeCloseTo(1.6);
      });

      it("excludes rush plays with null EPA from the rush sample", async () => {
        const g = await bal();
        expect(g.rushPlays).toBe(1);
        expect(g.rushEpa).toBeCloseTo(0.2);
      });

      it("counts every pass or rush play for pace, including null EPA", async () => {
        expect((await bal()).plays).toBe(6);
      });

      it("ignores punts and other non-offensive plays", async () => {
        const g = await bal();
        expect(g.passEpa + g.rushEpa).toBeLessThan(2);
      });

      it("counts neutral early-down plays, excluding lopsided wp, third down and the two-minute window", async () => {
        const g = await bal();
        expect(g.neutralPlays).toBe(3);
        expect(g.neutralPasses).toBe(1);
      });
    });
  });

  describe("loadSeasonSchedules", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE schedules AS SELECT * FROM (VALUES
          (2024, 1, 'KC', 'BAL'), (2024, 2, 'BAL', 'PIT'), (2024, 19, 'KC', 'HOU'), (2025, 1, 'PHI', 'DAL')
        ) AS t(season, week, home_team, away_team)`);
    });

    it("lists each requested season's teams and weeks, sorted", async () => {
      expect(await loadSeasonSchedules(db.connection, [2024])).toEqual([
        { season: 2024, teams: ["BAL", "HOU", "KC", "PIT"], weeks: [1, 2, 19] },
      ]);
    });
  });

  describe("writeTeamWeekFeatures", () => {
    const row: TeamWeekFeatures = {
      season: 2024,
      week: 5,
      team: "BAL",
      gamesPlayed: 4,
      offense: { all: 0.1, pass: 0.15, rush: 0.02 },
      defense: { all: -0.05, pass: -0.06, rush: -0.01 },
      league: { all: 0.01, pass: 0.05, rush: -0.07 },
      playsPerGame: 64.2,
      neutralPassRate: 0.51,
    };

    it("stores one flat row per team-week", async () => {
      await writeTeamWeekFeatures(db.connection, [row]);
      const stored = (await db.connection.runAndReadAll(`SELECT * FROM ${FEATURES_TABLE}`)).getRowObjectsJS();
      expect(stored).toEqual([
        {
          season: 2024,
          week: 5,
          team: "BAL",
          games_played: 4,
          off_epa: 0.1,
          off_pass_epa: 0.15,
          off_rush_epa: 0.02,
          def_epa: -0.05,
          def_pass_epa: -0.06,
          def_rush_epa: -0.01,
          league_epa: 0.01,
          league_pass_epa: 0.05,
          league_rush_epa: -0.07,
          plays_per_game: 64.2,
          neutral_pass_rate: 0.51,
        },
      ]);
    });

    it("replaces the table on rewrite", async () => {
      await writeTeamWeekFeatures(db.connection, [row]);
      await writeTeamWeekFeatures(db.connection, [{ ...row, week: 6 }]);
      const weeks = (await db.connection.runAndReadAll(`SELECT week FROM ${FEATURES_TABLE}`)).getRowsJson();
      expect(weeks).toEqual([[6]]);
    });
  });
});
