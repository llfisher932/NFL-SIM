import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAvailability, loadPlayerNames, loadPlayerSnaps, loadQbDropbacks, loadQbProfiles } from "../../src/data/availability";
import { openDatabase, type Database } from "../../src/data/db";

describe("data/availability", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("loadPlayerSnaps", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE players AS SELECT * FROM (VALUES
          ('00-0000001', 'AllenJo02'), ('00-0000002', 'DawkDi00'), ('00-0000003', 'BassTy00')
        ) AS t(gsis_id, pfr_id)`);
      await db.connection.run(`
        CREATE TABLE snap_counts AS SELECT * FROM (VALUES
          ('G', 2024, 5, 'AllenJo02', 'QB', 'BUF', 1.0, 0.0),
          ('G', 2024, 5, 'DawkDi00', 'T', 'BUF', 0.97, 0.0),
          ('G', 2024, 5, 'BassTy00', 'K', 'BUF', 0.0, 0.0),
          ('G', 2024, 5, 'UnknownX', 'CB', 'BUF', 0.0, 0.9),
          ('G', 2024, 5, 'DawkDi00', 'FS', 'BUF', 0.0, 0.4)
        ) AS t(game_id, season, week, pfr_player_id, position, team, offense_pct, defense_pct)`);
    });

    it("looks up display names by GSIS id", async () => {
      await db.connection.run("ALTER TABLE players ADD COLUMN display_name VARCHAR");
      await db.connection.run("UPDATE players SET display_name = 'Josh Allen' WHERE gsis_id = '00-0000001'");
      expect((await loadPlayerNames(db.connection)).get("00-0000001")).toBe("Josh Allen");
    });

    it("maps PFR ids to GSIS ids and positions to groups, skipping specialists and unknown players", async () => {
      const snaps = await loadPlayerSnaps(db.connection);
      expect(snaps.map((s) => [s.playerId, s.group, s.snapPct])).toEqual([
        ["00-0000001", "QB", 1],
        ["00-0000002", "OL", 0.97],
        ["00-0000002", "DB", 0.4],
      ]);
    });
  });

  describe("loadQbDropbacks", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE pbp AS SELECT * FROM (VALUES
          (2024, 5, '00-0000001', 'BUF', 1, 0.5),
          (2024, 5, '00-0000001', 'BUF', 1, -0.2),
          (2024, 5, '00-0000001', 'BUF', 0, 3.0),
          (2024, 5, '00-0000002', 'BUF', 1, NULL),
          (2024, 6, '00-0000001', 'BUF', 1, 0.1)
        ) AS t(season, week, id, posteam, qb_dropback, qb_epa)`);
    });

    it("sums dropbacks and EPA per QB per week, with his team", async () => {
      expect(await loadQbDropbacks(db.connection)).toEqual([
        { season: 2024, week: 5, playerId: "00-0000001", team: "BUF", dropbacks: 2, epa: expect.closeTo(0.3) },
        { season: 2024, week: 6, playerId: "00-0000001", team: "BUF", dropbacks: 1, epa: expect.closeTo(0.1) },
      ]);
    });
  });

  describe("loadQbProfiles", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE players AS SELECT * FROM (VALUES
          ('00-0000001', 'QB', 1, 2020),
          ('00-0000002', 'QB', NULL, 2022),
          ('00-0000003', 'WR', 2, 2021)
        ) AS t(gsis_id, position, draft_round, rookie_season)`);
    });

    it("keeps draft round and rookie season for quarterbacks only", async () => {
      const profiles = await loadQbProfiles(db.connection);
      expect([...profiles]).toEqual([
        ["00-0000001", { draftRound: 1, rookieSeason: 2020 }],
        ["00-0000002", { draftRound: null, rookieSeason: 2022 }],
      ]);
    });
  });

  describe("loadAvailability", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE weekly_rosters AS SELECT * FROM (VALUES
          (2024, 5, 'BUF', '00-0000001', 'ACT'),
          (2024, 5, 'BUF', '00-0000002', 'INA')
        ) AS t(season, week, team, gsis_id, status)`);
      await db.connection.run(`
        CREATE TABLE injury_reports AS SELECT * FROM (VALUES
          (2024, 5, 'BUF', '00-0000001', 'Questionable'),
          (2024, 5, 'KC', '00-0000009', 'Out'),
          (2024, 5, 'KC', '00-0000008', NULL)
        ) AS t(season, week, team, gsis_id, report_status)`);
    });

    it("joins roster status and injury designation per player-week", async () => {
      const { reports } = await loadAvailability(db.connection);
      const byId = new Map(reports.map((r) => [r.playerId, r]));
      expect(byId.get("00-0000001")).toMatchObject({ rosterStatus: "ACT", injuryStatus: "Questionable" });
      expect(byId.get("00-0000002")).toMatchObject({ rosterStatus: "INA", injuryStatus: null });
      expect(byId.get("00-0000009")).toMatchObject({ team: "KC", rosterStatus: null, injuryStatus: "Out" });
    });

    it("skips injury rows without a designation", async () => {
      const { reports } = await loadAvailability(db.connection);
      expect(reports.some((r) => r.playerId === "00-0000008")).toBe(false);
    });

    it("records which team-weeks have a published roster", async () => {
      const { rosterTeamWeeks } = await loadAvailability(db.connection);
      expect([...rosterTeamWeeks]).toEqual(["2024:5:BUF"]);
    });
  });
});
