import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../../src/data/db";
import { loadConversionCounts, loadDrives, loadWeekGames } from "../../src/data/drives";

describe("data/drives", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("loadDrives", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE pbp AS SELECT * FROM (VALUES
          ('G', 2024, 5, 1, 1, 'BAL', 'KC', 'Half1', 35, 1800, NULL, 'Touchdown'),
          ('G', 2024, 5, 2, 1, 'BAL', 'KC', 'Half1', 75, 1795, 1,    'Touchdown'),
          ('G', 2024, 5, 3, 1, 'BAL', 'KC', 'Half1', 40, 1700, 2,    'Touchdown'),
          ('G', 2024, 5, 4, 1, 'BAL', 'KC', 'Half1', 8,  1600, 1,    'Touchdown'),
          ('G', 2024, 5, 5, 1, 'BAL', 'KC', 'Half1', 15, 1590, NULL, 'Touchdown'),
          ('G', 2024, 5, 6, 2, 'KC', 'BAL', 'Half1', 35, 1590, NULL, 'Punt'),
          ('G', 2024, 5, 7, 2, 'KC', 'BAL', 'Half1', 72, 1585, 1,    'Punt'),
          ('G', 2024, 5, 8, 2, 'KC', 'BAL', 'Half1', 70, 1500, 4,    'Punt'),
          ('G', 2024, 5, 9, 3, 'BAL', 'KC', 'Half1', 68, 1450, 1,    'End of half'),
          ('G', 2024, 5, 10, 4, 'KC', 'BAL', 'Half2', 35, 1800, NULL, 'End of half'),
          ('G', 2024, 5, 11, 5, 'BAL', 'KC', 'Overtime', 70, 600, 1, 'Field goal'),
          ('G', 2024, 5, 12, 6, 'KC', 'BAL', 'Half2', 60, 900, 1,   'Kneel'),
          ('G', 2024, 5, 13, NULL, NULL, NULL, 'Half1', NULL, 0, NULL, NULL)
        ) AS t(game_id, season, week, play_id, fixed_drive, posteam, defteam, game_half,
               yardline_100, half_seconds_remaining, down, fixed_drive_result)`);
    });

    const find = async (offense: string, outcome: string) =>
      (await loadDrives(db.connection)).find((d) => d.offense === offense && d.outcome === outcome)!;

    it("starts a drive at its first snap rather than the kickoff", async () => {
      expect((await find("BAL", "touchdown")).startYardline).toBe(75);
    });

    it("ends a drive at its last snap rather than the extra point", async () => {
      expect((await find("BAL", "touchdown")).endYardline).toBe(8);
    });

    it("measures duration to the next drive's start, including the kick", async () => {
      expect((await find("BAL", "touchdown")).durationSeconds).toBe(1800 - 1590);
    });

    it("runs the last drive of a half to zero", async () => {
      expect((await find("BAL", "end_of_half")).durationSeconds).toBe(1450);
    });

    it("records the next drive's start yardline within the half", async () => {
      expect((await find("KC", "punt")).nextStartYardline).toBe(68);
    });

    it("leaves the next start empty for the last drive of a half", async () => {
      expect((await find("BAL", "end_of_half")).nextStartYardline).toBeNull();
    });

    it("maps nflverse result labels to drive outcomes", async () => {
      const outcomes = (await loadDrives(db.connection)).map((d) => d.outcome);
      expect(outcomes).toEqual(["touchdown", "punt", "end_of_half"]);
    });

    it("drops overtime, snapless drives and unknown results", async () => {
      const drives = await loadDrives(db.connection);
      expect(drives.map((d) => d.half)).toEqual([1, 1, 1]);
    });
  });

  describe("loadConversionCounts", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE pbp AS SELECT * FROM (VALUES
          (2024, 1, 1, 0, 'good', NULL),
          (2024, 1, 1, 0, 'good', NULL),
          (2024, 1, 1, 0, 'blocked', NULL),
          (2024, 1, 0, 1, NULL, 'success'),
          (2024, 1, 0, 1, NULL, 'failure'),
          (2024, 1, 0, 0, NULL, NULL)
        ) AS t(season, week, extra_point_attempt, two_point_attempt, extra_point_result, two_point_conv_result)`);
    });

    it("counts attempts by bonus points earned", async () => {
      expect(await loadConversionCounts(db.connection)).toEqual([
        { season: 2024, week: 1, bonusPoints: 0, count: 2 },
        { season: 2024, week: 1, bonusPoints: 1, count: 2 },
        { season: 2024, week: 1, bonusPoints: 2, count: 1 },
      ]);
    });
  });

  describe("loadWeekGames", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE schedules AS SELECT * FROM (VALUES
          ('2025_05_MIN_CLE', 2025, 5, 'REG', '2025-10-05', '09:30', 'CLE', 'MIN', 'Neutral', -3.5, 35.5, 17, 21),
          ('2025_05_SF_LA',   2025, 5, 'REG', '2025-10-02', '20:15', 'LA',  'SF',  'Home',     8.5, 43.5, NULL, NULL),
          ('2025_06_X_Y',     2025, 6, 'REG', '2025-10-12', '13:00', 'Y',   'X',   'Home',     1.0, 44.0, NULL, NULL)
        ) AS t(game_id, season, week, game_type, gameday, gametime, home_team, away_team, location,
               spread_line, total_line, home_score, away_score)`);
    });

    it("returns the week's games in kickoff order", async () => {
      const games = await loadWeekGames(db.connection, 2025, 5);
      expect(games.map((g) => g.gameId)).toEqual(["2025_05_SF_LA", "2025_05_MIN_CLE"]);
    });

    it("flags neutral-site games and keeps lines and scores", async () => {
      const [, london] = await loadWeekGames(db.connection, 2025, 5);
      expect(london).toMatchObject({ neutralSite: true, spreadLine: -3.5, totalLine: 35.5, homeScore: 17, awayScore: 21 });
    });

    it("leaves scores null for unplayed games", async () => {
      const [upcoming] = await loadWeekGames(db.connection, 2025, 5);
      expect(upcoming).toMatchObject({ homeScore: null, awayScore: null, neutralSite: false });
    });
  });
});
