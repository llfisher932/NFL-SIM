import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase, type Database } from "../../src/data/db";
import { findRejects, loadTable, REJECTS_TABLE } from "../../src/data/load";
import type { TableSpec } from "../../src/data/tables";

const toySpec: TableSpec = {
  table: "toy",
  dataset: "pbp",
  schema: z.object({
    season: z.int(),
    week: z.int({ error: "missing week" }).max(22, "invalid week"),
    team: z.string({ error: "missing team" }),
  }),
  keySql: "concat_ws(':', team, week)",
};

describe("data/load", () => {
  describe("findRejects", () => {
    const rows = [
      { id: 1, key: "a", fields: { season: 2024, week: 1, team: "BAL" } },
      { id: 2, key: "b", fields: { season: 2024, week: 30, team: "BAL" } },
      { id: 3, key: "c", fields: { season: 2024, week: 1, team: null } },
    ];

    it("returns only rows that fail the schema", () => {
      expect(findRejects(rows, toySpec.schema).map((r) => r.id)).toEqual([2, 3]);
    });

    it("carries the row key and the zod message", () => {
      expect(findRejects(rows, toySpec.schema)[0]).toEqual({ id: 2, key: "b", reason: "invalid week" });
    });
  });

  describe("loadTable", () => {
    let dir: string;
    let db: Database;

    const count = async (sql: string) =>
      Number((await db.connection.runAndReadAll(sql)).getRows()[0]?.[0]);

    async function writeParquet(name: string, selectSql: string): Promise<string> {
      const path = join(dir, name).replaceAll("\\", "/");
      await db.connection.run(`COPY (${selectSql}) TO '${path}' (FORMAT parquet)`);
      return path;
    }

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "gridiron-load-"));
      db = await openDatabase(":memory:");
    });

    afterEach(async () => {
      db.close();
      await rm(dir, { recursive: true, force: true });
    });

    describe("with valid and invalid rows across seasons", () => {
      let paths: string[];

      beforeEach(async () => {
        paths = [
          await writeParquet(
            "a.parquet",
            `SELECT * FROM (VALUES (2023, 1, 'BAL'), (2023, 2, 'BAL'), (2022, 1, 'OLD'))
             AS t(season, week, team)`,
          ),
          await writeParquet(
            "b.parquet",
            `SELECT * FROM (VALUES (2024, 1, 'CIN', 'x'), (2024, 30, 'CIN', 'y'), (2024, 2, NULL, 'z'))
             AS t(season, week, team, extra)`,
          ),
        ];
      });

      it("reports loaded and rejected counts per requested season", async () => {
        const report = await loadTable(db.connection, toySpec, paths, [2023, 2024]);
        expect(report.seasons).toEqual([
          { season: 2023, loaded: 2, rejected: 0 },
          { season: 2024, loaded: 1, rejected: 2 },
        ]);
      });

      it("tallies rejects by reason", async () => {
        const report = await loadTable(db.connection, toySpec, paths, [2023, 2024]);
        expect(report.rejectReasons).toEqual({ "invalid week": 1, "missing team": 1 });
      });

      it("removes rejected rows and rows from unrequested seasons", async () => {
        await loadTable(db.connection, toySpec, paths, [2023, 2024]);
        const rows = (await db.connection.runAndReadAll("SELECT season, week, team FROM toy ORDER BY ALL"))
          .getRowsJson();
        expect(rows).toEqual([
          [2023, 1, "BAL"],
          [2023, 2, "BAL"],
          [2024, 1, "CIN"],
        ]);
      });

      it("keeps columns that exist in only some files", async () => {
        await loadTable(db.connection, toySpec, paths, [2023, 2024]);
        expect(await count("SELECT count(*) FROM toy WHERE extra IS NULL")).toBe(2);
      });

      it("records each reject with table, season, key and reason", async () => {
        await loadTable(db.connection, toySpec, paths, [2023, 2024]);
        const rejects = (
          await db.connection.runAndReadAll(`SELECT * FROM ${REJECTS_TABLE} ORDER BY row_key`)
        ).getRowsJson();
        expect(rejects).toEqual([
          ["toy", 2024, "2", "missing team"],
          ["toy", 2024, "CIN:30", "invalid week"],
        ]);
      });

      it("replaces earlier rejects for the same table on reload", async () => {
        await loadTable(db.connection, toySpec, paths, [2023, 2024]);
        await loadTable(db.connection, toySpec, paths, [2023]);
        expect(await count(`SELECT count(*) FROM ${REJECTS_TABLE}`)).toBe(0);
      });
    });

    describe("when a validated column is absent from the parquet", () => {
      it("throws naming the missing column", async () => {
        const path = await writeParquet("c.parquet", "SELECT 2024 AS season, 1 AS week");
        await expect(loadTable(db.connection, toySpec, [path], [2024])).rejects.toThrow(
          "toy: missing columns team",
        );
      });

      it("rolls back and keeps the previously loaded table", async () => {
        const good = await writeParquet("good.parquet", "SELECT 2024 AS season, 1 AS week, 'BAL' AS team");
        await loadTable(db.connection, toySpec, [good], [2024]);
        const bad = await writeParquet("bad.parquet", "SELECT 2024 AS season, 1 AS week");
        await loadTable(db.connection, toySpec, [bad], [2024]).catch(() => {});
        expect(await count("SELECT count(*) FROM toy WHERE team = 'BAL'")).toBe(1);
      });
    });

    describe("with invalid seasons", () => {
      it("refuses an empty season list", async () => {
        await expect(loadTable(db.connection, toySpec, [], [])).rejects.toThrow("invalid seasons");
      });
    });
  });
});
