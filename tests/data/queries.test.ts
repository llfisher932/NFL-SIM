import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../../src/data/db";
import { teamEpaPerPlay } from "../../src/data/queries";

describe("data/queries", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    await db.connection.run(`
      CREATE TABLE pbp AS SELECT * FROM (VALUES
        (2024, 5, 'BAL', 'CIN', 0.6, 1, 0),
        (2024, 5, 'BAL', 'CIN', -0.2, 0, 1),
        (2024, 5, 'BAL', 'CIN', 3.0, 0, 0),
        (2024, 5, 'BAL', 'CIN', NULL, 1, 0),
        (2024, 5, 'CIN', 'BAL', 0.1, 1, 0),
        (2024, 6, 'BAL', 'WAS', 5.0, 1, 0),
        (2023, 5, 'BAL', 'CIN', 5.0, 1, 0)
      ) AS t(season, week, posteam, defteam, epa, pass, rush)`);
  });

  afterEach(() => {
    db.close();
  });

  describe("teamEpaPerPlay", () => {
    describe("for a week with one game", () => {
      it("returns one row per team", async () => {
        const rows = await teamEpaPerPlay(db.connection, 2024, 5);
        expect(rows.map((r) => r.team)).toEqual(["BAL", "CIN"]);
      });

      it("averages offensive EPA over pass and rush plays with EPA only", async () => {
        const [bal] = await teamEpaPerPlay(db.connection, 2024, 5);
        expect(bal?.offPlays).toBe(2);
        expect(bal?.offEpaPerPlay).toBeCloseTo(0.2);
      });

      it("measures defense by the EPA the opponent's offense produced", async () => {
        const rows = await teamEpaPerPlay(db.connection, 2024, 5);
        const cin = rows.find((r) => r.team === "CIN");
        expect(cin?.defPlays).toBe(2);
        expect(cin?.defEpaPerPlay).toBeCloseTo(0.2);
      });

      it("excludes other weeks and seasons", async () => {
        const rows = await teamEpaPerPlay(db.connection, 2024, 5);
        expect(rows.find((r) => r.team === "BAL")?.defEpaPerPlay).toBeCloseTo(0.1);
      });
    });

    describe("for a week with no plays", () => {
      it("returns an empty list", async () => {
        expect(await teamEpaPerPlay(db.connection, 2024, 9)).toEqual([]);
      });
    });
  });
});
