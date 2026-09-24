import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../../src/data/db";
import { appendPickSnapshots, loadPickSnapshots } from "../../src/data/pickLog";
import type { PickSnapshot } from "../../src/types/tracker";

const snapshot = (capturedAt: string, spreadLine: number | null): PickSnapshot => ({
  gameId: "2026_03_TEN_NYG",
  season: 2026,
  week: 3,
  capturedAt,
  home: "NYG",
  away: "TEN",
  modelHomeWinProb: 0.6,
  modelMargin: 3.4,
  modelTotal: 46.4,
  spreadLine,
  totalLine: 38.5,
});

describe("data/pickLog", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("loadPickSnapshots", () => {
    it("is empty before anything is logged", async () => {
      expect(await loadPickSnapshots(db.connection)).toEqual([]);
    });
  });

  describe("appendPickSnapshots", () => {
    it("keeps every snapshot in capture order, with missing lines as null", async () => {
      await appendPickSnapshots(db.connection, [snapshot("2026-09-24T11:00:00.000Z", 2.5)]);
      await appendPickSnapshots(db.connection, [snapshot("2026-09-26T11:00:00.000Z", null)]);
      expect(await loadPickSnapshots(db.connection)).toEqual([
        snapshot("2026-09-24T11:00:00.000Z", 2.5),
        snapshot("2026-09-26T11:00:00.000Z", null),
      ]);
    });
  });
});
