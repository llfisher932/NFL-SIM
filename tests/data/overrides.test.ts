import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOverrides, parseOverrides } from "../../src/data/overrides";

const base = { season: 2025, week: 5, playerId: "00-0036358" };

describe("data/overrides", () => {
  describe("parseOverrides", () => {
    it("accepts an out status", () => {
      expect(parseOverrides([{ ...base, status: "out", note: "hamstring" }])).toEqual([{ ...base, status: "out", note: "hamstring" }]);
    });

    it("accepts share overrides", () => {
      expect(parseOverrides([{ ...base, targetShare: 0.3, carryShare: 0 }])).toHaveLength(1);
    });

    it("accepts a new player with team, name and position", () => {
      expect(parseOverrides([{ ...base, team: "CIN", name: "Rookie", position: "WR", targetShare: 0.1 }])).toHaveLength(1);
    });

    it("rejects an override that changes nothing", () => {
      expect(() => parseOverrides([base])).toThrow("overrides: [0] override does nothing");
    });

    it("rejects an out player with shares", () => {
      expect(() => parseOverrides([{ ...base, status: "out", targetShare: 0.2 }])).toThrow("out player with shares");
    });

    it("rejects a malformed player id with its location", () => {
      expect(() => parseOverrides([{ ...base, playerId: "Chase", status: "out" }])).toThrow("overrides: [0.playerId] invalid playerId");
    });

    it("rejects a share above 1", () => {
      expect(() => parseOverrides([{ ...base, targetShare: 1.5 }])).toThrow("invalid targetShare");
    });

    it("rejects unknown fields", () => {
      expect(() => parseOverrides([{ ...base, status: "out", injury: "knee" }])).toThrow("overrides:");
    });

    it("requires a list", () => {
      expect(() => parseOverrides({})).toThrow("overrides must be a list");
    });
  });

  describe("loadOverrides", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "gridiron-overrides-"));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("returns no overrides when the file does not exist", async () => {
      expect(await loadOverrides(join(dir, "missing.json"))).toEqual([]);
    });

    it("reads and validates the file", async () => {
      const path = join(dir, "overrides.json");
      await writeFile(path, JSON.stringify([{ ...base, status: "out" }]));
      expect(await loadOverrides(path)).toEqual([{ ...base, status: "out" }]);
    });
  });
});
