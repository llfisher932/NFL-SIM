import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../../src/data/db";
import { loadPlayerGames } from "../../src/data/playerGames";
import { PLAYER_PROJECTIONS_TABLE, writePlayerProjections } from "../../src/data/playerProjectionStore";
import type { PlayerProjection } from "../../src/types/players";

describe("data/playerGames", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("loadPlayerGames", () => {
    beforeEach(async () => {
      await db.connection.run(`
        CREATE TABLE player_weekly_stats AS SELECT * FROM (VALUES
          ('00-0000001', 'Wide Out', 'WR', 'BUF', 2024, 5, 'G', 0, 0, 0, 0, 0, 8, 6, 90, 1, 110, 0, 0, 0),
          ('00-0000002', 'Full Back', 'FB', 'BUF', 2024, 5, 'G', 0, 0, 0, 0, 0, 1, 1, 4, 0, 1, 3, 9, 1),
          ('00-0000003', 'Kicker', 'K', 'BUF', 2024, 5, 'G', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        ) AS t(player_id, player_display_name, position, team, season, week, game_id,
               attempts, completions, passing_yards, passing_tds, passing_interceptions,
               targets, receptions, receiving_yards, receiving_tds, receiving_air_yards,
               carries, rushing_yards, rushing_tds)`);
      await db.connection.run(`
        CREATE TABLE pbp AS SELECT * FROM (VALUES
          ('G', 12, 'pass', 0, 0, '00-0000001', NULL, 0),
          ('G', 30, 'pass', 0, 0, '00-0000001', NULL, 0),
          ('G', 8, 'pass', 1, 0, '00-0000001', NULL, 0),
          ('G', 3, 'run', 0, 0, NULL, '00-0000002', 1),
          ('G', 2, 'pass', 0, 1, '00-0000001', NULL, 0)
        ) AS t(game_id, yardline_100, play_type, sack, two_point_attempt, receiver_player_id, rusher_player_id, rush_attempt)`);
    });

    it("keeps skill positions and maps fullbacks to RB", async () => {
      const games = await loadPlayerGames(db.connection);
      expect(games.map((g) => [g.name, g.position])).toEqual([
        ["Wide Out", "WR"],
        ["Full Back", "RB"],
      ]);
    });

    it("counts red-zone targets, excluding sacks and two-point tries", async () => {
      const [receiver] = await loadPlayerGames(db.connection);
      expect(receiver).toMatchObject({ targets: 8, rzTargets: 1, airYards: 110 });
    });

    it("counts red-zone carries", async () => {
      const [, back] = await loadPlayerGames(db.connection);
      expect(back).toMatchObject({ carries: 3, rzCarries: 1, rzTargets: 0 });
    });
  });

  describe("writePlayerProjections", () => {
    const stat = { mean: 50, p10: 10, p50: 45, p90: 95 };
    const projection: PlayerProjection = {
      gameId: "G",
      playerId: "00-0000001",
      name: "Wide Out",
      position: "WR",
      team: "BUF",
      opponent: "NE",
      starterQb: false,
      targets: 7,
      carries: 0,
      receptions: stat,
      recYards: stat,
      rushYards: stat,
      passYards: stat,
      passTds: 0,
      interceptions: 0,
      touchdowns: stat,
      anytimeTdProb: 0.3,
    };

    it("stores summaries and replaces an existing week", async () => {
      await writePlayerProjections(db.connection, { season: 2024, week: 5 }, [projection]);
      await writePlayerProjections(db.connection, { season: 2024, week: 5 }, [{ ...projection, targets: 9 }]);
      await writePlayerProjections(db.connection, { season: 2024, week: 6 }, [projection]);
      const rows = (
        await db.connection.runAndReadAll(`SELECT week, targets, rec_yards_p90 FROM ${PLAYER_PROJECTIONS_TABLE} ORDER BY week`)
      ).getRowsJson();
      expect(rows).toEqual([
        [5, 9, 95],
        [6, 7, 95],
      ]);
    });
  });
});
