import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDashboardIndex, writeDashboardIndex, writeDashboardWeek } from "../../src/data/dashboardStore";

describe("data/dashboardStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gridiron-dashboard-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("readDashboardIndex", () => {
    it("returns null before anything is exported", async () => {
      expect(await readDashboardIndex(dir)).toBeNull();
    });

    it("reads back what was written", async () => {
      const index = { weeks: [{ season: 2025, week: 5, games: 14, generatedAt: "t", file: "week-2025-05.json" }], record: null };
      await writeDashboardIndex(dir, index);
      expect(await readDashboardIndex(dir)).toEqual(index);
    });
  });

  describe("writeDashboardWeek", () => {
    it("rounds fractional numbers to four decimals and keeps integers", async () => {
      const week = { season: 2025, week: 5, generatedAt: "t", sims: 2000, seed: 1, injuries: true, games: [] };
      await writeDashboardWeek(dir, "w.json", { ...week, extra: 0.123456789 } as typeof week);
      const written = JSON.parse(await readFile(join(dir, "w.json"), "utf8"));
      expect(written).toMatchObject({ sims: 2000, extra: 0.1235 });
    });
  });
});
