import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../../src/data/db";
import { loadConversionCounts, loadDrives, loadSeasonGames, loadWeekGames } from "../../src/data/drives";

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
        CREATE TABLE plays AS SELECT * FROM (VALUES
          ('G', 2024, 5, 1, 1, 'BAL', 'KC', 'Half1', 35, 1800, NULL, 'Touchdown', 'kickoff'),
          ('G', 2024, 5, 2, 1, 'BAL', 'KC', 'Half1', 75, 1795, 1,    'Touchdown', 'pass'),
          ('G', 2024, 5, 3, 1, 'BAL', 'KC', 'Half1', 40, 1700, 2,    'Touchdown', 'run'),
          ('G', 2024, 5, 4, 1, 'BAL', 'KC', 'Half1', 8,  1600, 1,    'Touchdown', 'pass'),
          ('G', 2024, 5, 5, 1, 'BAL', 'KC', 'Half1', 15, 1590, NULL, 'Touchdown', 'extra_point'),
          ('G', 2024, 5, 6, 2, 'KC', 'BAL', 'Half1', 35, 1590, NULL, 'Punt', 'kickoff'),
          ('G', 2024, 5, 7, 2, 'KC', 'BAL', 'Half1', 72, 1585, 1,    'Punt', 'pass'),
          ('G', 2024, 5, 8, 2, 'KC', 'BAL', 'Half1', 70, 1500, 4,    'Punt', 'punt'),
          ('G', 2024, 5, 9, 3, 'BAL', 'KC', 'Half1', 68, 1450, 1,    'End of half', 'qb_kneel'),
          ('G', 2024, 5, 10, 4, 'KC', 'BAL', 'Half2', 35, 1800, NULL, 'End of half', 'kickoff'),
          ('G', 2024, 5, 11, 5, 'BAL', 'KC', 'Overtime', 70, 600, 1, 'Field goal', 'field_goal'),
          ('G', 2024, 5, 12, 6, 'KC', 'BAL', 'Half2', 60, 900, 1,   'Kneel', 'qb_kneel'),
          ('G', 2024, 5, 13, NULL, NULL, NULL, 'Half1', NULL, 0, NULL, NULL, NULL)
        ) AS t(game_id, season, week, play_id, fixed_drive, posteam, defteam, game_half,
               yardline_100, half_seconds_remaining, down, fixed_drive_result, play_type)`);
      await db.connection.run(
        "ALTER TABLE plays ADD COLUMN game_seconds_remaining DOUBLE; " +
          "UPDATE plays SET game_seconds_remaining = half_seconds_remaining + CASE WHEN game_half = 'Half1' THEN 1800 ELSE 0 END; " +
          "ALTER TABLE plays ADD COLUMN score_differential DOUBLE; " +
          "UPDATE plays SET score_differential = CASE WHEN posteam = 'KC' THEN -7 ELSE 0 END",
      );
      await db.connection.run(`
        CREATE TABLE box AS SELECT * FROM (VALUES
          (2, 1, 0, 0, 1, 25, 0, 0, 'WR1', 0, NULL, 0),
          (3, 0, 0, 0, 0, NULL, 0, 0, NULL, 1, 32, 0),
          (4, 1, 0, 0, 1, 8, 1, 0, 'TE1', 0, NULL, 0),
          (5, 0, 0, 1, 0, NULL, 0, 0, NULL, 0, NULL, 0),
          (7, 1, 1, 0, 0, NULL, 0, 0, NULL, 0, NULL, 0),
          (9, 0, 0, 0, 0, NULL, 0, 0, NULL, 1, -1, 0)
        ) AS t(play_id, pass_attempt, sack, two_point_attempt, complete_pass, passing_yards, pass_touchdown,
               interception, receiver_player_id, rush_attempt, rushing_yards, rush_touchdown)`);
      await db.connection.run(`
        CREATE TABLE pbp AS
        SELECT p.*, coalesce(b.pass_attempt, 0) AS pass_attempt, coalesce(b.sack, 0) AS sack,
          coalesce(b.two_point_attempt, 0) AS two_point_attempt, coalesce(b.complete_pass, 0) AS complete_pass,
          b.passing_yards, coalesce(b.pass_touchdown, 0) AS pass_touchdown, coalesce(b.interception, 0) AS interception,
          b.receiver_player_id, coalesce(b.rush_attempt, 0) AS rush_attempt, b.rushing_yards,
          coalesce(b.rush_touchdown, 0) AS rush_touchdown
        FROM plays p LEFT JOIN box b USING (play_id)`);
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

    it("sums the drive's box score, excluding sacks from attempts", async () => {
      expect((await find("BAL", "touchdown")).stats).toEqual({
        passAttempts: 2,
        completions: 2,
        passYards: 33,
        passTds: 1,
        interceptions: 0,
        targets: 2,
        carries: 1,
        rushYards: 32,
        rushTds: 0,
      });
      expect((await find("KC", "punt")).stats.passAttempts).toBe(0);
    });

    it("records the offense's lead and the game clock at the drive's start", async () => {
      expect(await find("KC", "punt")).toMatchObject({ scoreDiff: -7, gameSecondsLeft: 1590 + 1800 });
    });

    it("counts kneels as carries", async () => {
      expect((await find("BAL", "end_of_half")).stats).toMatchObject({ carries: 1, rushYards: -1 });
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
          ('2025_05_MIN_CLE', 2025, 5, 'REG', '2025-10-05', '09:30', 'CLE', 'MIN', 'Neutral', -3.5, 35.5, 150, -180, 17, 21, NULL, NULL, 7, 7),
          ('2025_05_SF_LA',   2025, 5, 'REG', '2025-10-02', '20:15', 'LA',  'SF',  'Home',     8.5, 43.5, -400, 310, NULL, NULL, '00-0000010', '00-0000020', 7, 7),
          ('2025_06_X_Y',     2025, 6, 'REG', '2025-10-12', '13:00', 'Y',   'X',   'Home',     1.0, 44.0, NULL, NULL, NULL, NULL, NULL, NULL, 7, 7),
          ('2024_01_X_Y',     2024, 1, 'REG', '2024-09-08', '13:00', 'Y',   'X',   'Home',     1.0, 44.0, NULL, NULL, 20, 10, NULL, NULL, 7, 7)
        ) AS t(game_id, season, week, game_type, gameday, gametime, home_team, away_team, location,
               spread_line, total_line, home_moneyline, away_moneyline, home_score, away_score, home_qb_id, away_qb_id, home_rest, away_rest)`);
    });

    it("returns the week's games in kickoff order", async () => {
      const games = await loadWeekGames(db.connection, 2025, 5);
      expect(games.map((g) => g.gameId)).toEqual(["2025_05_SF_LA", "2025_05_MIN_CLE"]);
    });

    it("flags neutral-site games and keeps lines and scores", async () => {
      const [, london] = await loadWeekGames(db.connection, 2025, 5);
      expect(london).toMatchObject({ neutralSite: true, spreadLine: -3.5, totalLine: 35.5, homeScore: 17, awayScore: 21 });
    });

    it("keeps both moneylines", async () => {
      const [, london] = await loadWeekGames(db.connection, 2025, 5);
      expect(london).toMatchObject({ homeMoneyline: 150, awayMoneyline: -180 });
    });

    it("keeps the listed starting QBs", async () => {
      const [upcoming] = await loadWeekGames(db.connection, 2025, 5);
      expect(upcoming).toMatchObject({ homeQb: "00-0000010", awayQb: "00-0000020" });
    });

    it("keeps each team's days of rest", async () => {
      const [upcoming] = await loadWeekGames(db.connection, 2025, 5);
      expect(upcoming).toMatchObject({ homeRest: 7, awayRest: 7 });
    });

    it("leaves scores null for unplayed games", async () => {
      const [upcoming] = await loadWeekGames(db.connection, 2025, 5);
      expect(upcoming).toMatchObject({ homeScore: null, awayScore: null, neutralSite: false });
    });
  });

  describe("loadSeasonGames", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE schedules AS SELECT * FROM (VALUES
          ('2025_01_A_B', 2025, 1, 'REG', '2025-09-07', '13:00', 'B', 'A', 'Home', 1.0, 44.0, -120, 100, 20, 17, NULL, NULL, 7, 7),
          ('2024_19_C_D', 2024, 19, 'WC', '2025-01-11', '16:30', 'D', 'C', 'Home', 3.0, 45.0, -160, 135, 24, 21, NULL, NULL, 7, 7),
          ('2024_01_E_F', 2024, 1, 'REG', '2024-09-08', '13:00', 'F', 'E', 'Home', 2.0, 40.0, -130, 110, 13, 10, NULL, NULL, 7, 7),
          ('2023_01_G_H', 2023, 1, 'REG', '2023-09-10', '13:00', 'H', 'G', 'Home', 2.0, 40.0, -130, 110, 13, 10, NULL, NULL, 7, 7)
        ) AS t(game_id, season, week, game_type, gameday, gametime, home_team, away_team, location,
               spread_line, total_line, home_moneyline, away_moneyline, home_score, away_score, home_qb_id, away_qb_id, home_rest, away_rest)`);
    });

    it("returns every game of the requested seasons in chronological order", async () => {
      const games = await loadSeasonGames(db.connection, [2024, 2025]);
      expect(games.map((g) => g.gameId)).toEqual(["2024_01_E_F", "2024_19_C_D", "2025_01_A_B"]);
    });
  });
});
