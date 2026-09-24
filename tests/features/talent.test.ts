import { describe, expect, it } from "vitest";
import { DEFAULT_TALENT_CONFIG, createTalentModel, type PlayerContract } from "../../src/features/talent";
import type { PlayerSnap, PositionGroup } from "../../src/types/injuries";

const snap = (playerId: string, group: PositionGroup): PlayerSnap => ({
  season: 2024,
  week: 1,
  gameId: "2024_01_KC_BUF",
  team: "BUF",
  playerId,
  group,
  snapPct: 0.9,
});
const contract = (playerId: string, yearSigned: number, apyCapPct: number): PlayerContract => ({ playerId, yearSigned, apyCapPct });

const snaps = [snap("00-000000A", "WR"), snap("00-000000B", "WR"), snap("00-000000C", "WR"), snap("00-000000L", "OL")];
const contracts = [
  contract("00-000000A", 2022, 0.01),
  contract("00-000000B", 2023, 0.04),
  contract("00-000000C", 2021, 0.16),
  contract("00-000000C", 2025, 0.2),
  contract("00-000000L", 2022, 0.08),
];
const talent = createTalentModel(contracts, snaps, DEFAULT_TALENT_CONFIG);

describe("features/talent", () => {
  describe("createTalentModel", () => {
    it("rates the group's median contract at 1", () => {
      expect(talent("00-000000B", 2024)).toBeCloseTo(1, 9);
    });

    it("rates a bigger contract above a smaller one by the square root of the ratio", () => {
      expect(talent("00-000000C", 2024)).toBeCloseTo(2, 9);
      expect(talent("00-000000A", 2024)).toBeCloseTo(0.5, 9);
    });

    it("compares players only within their position group", () => {
      expect(talent("00-000000L", 2024)).toBeCloseTo(1, 9);
    });

    it("uses only contracts signed in or before the season", () => {
      expect(talent("00-000000C", 2024)).toBeCloseTo(2, 9);
      expect(talent("00-000000C", 2025)).not.toBeCloseTo(2, 3);
    });

    it("treats a player without a contract as the median", () => {
      expect(talent("00-000000Z", 2024)).toBe(1);
    });

    it("caps extreme contracts", () => {
      const capped = createTalentModel([...contracts, contract("00-000000A", 2023, 0.0001)], snaps, DEFAULT_TALENT_CONFIG);
      expect(capped("00-000000A", 2024)).toBe(DEFAULT_TALENT_CONFIG.min);
    });
  });
});
