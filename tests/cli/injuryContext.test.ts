import { describe, expect, it } from "vitest";
import { describeAbsence, manualOuts, mergeOverrides } from "../../src/cli/injuryContext";
import type { TeamAbsence } from "../../src/types/injuries";

describe("cli/injuryContext", () => {
  describe("manualOuts", () => {
    it("keys out players by season, week and player", () => {
      const overrides = [
        { season: 2026, week: 3, playerId: "00-0040691", status: "out" as const },
        { season: 2026, week: 3, playerId: "00-0000002", targetShare: 0.2 },
      ];
      expect([...manualOuts(overrides)]).toEqual(["2026:3:00-0040691"]);
    });
  });

  describe("mergeOverrides", () => {
    const manual = [{ season: 2025, week: 5, playerId: "00-0000001", targetShare: 0.2 }];
    const automatic = [
      { season: 2025, week: 5, playerId: "00-0000001", status: "out" as const },
      { season: 2025, week: 5, playerId: "00-0000002", status: "out" as const },
    ];

    it("lets a manual override win over an automatic out for the same player", () => {
      const merged = mergeOverrides(manual, automatic);
      expect(merged.filter((o) => o.playerId === "00-0000001")).toEqual(manual);
    });

    it("keeps automatic outs for other players", () => {
      expect(mergeOverrides(manual, automatic).map((o) => o.playerId)).toEqual(["00-0000001", "00-0000002"]);
    });
  });

  describe("describeAbsence", () => {
    const absence: TeamAbsence = {
      season: 2025,
      week: 5,
      team: "BUF",
      offense: { QB: 1, RB: 0, WR: 0, TE: 0, OL: 0 },
      defense: { DL: 0, LB: 0, DB: 0 },
      qbDelta: 0,
      missing: [
        { playerId: "00-0000002", group: "OL", role: 0.9, probability: 1, reason: "inactive" },
        { playerId: "00-0000001", group: "QB", role: 1, probability: 1, reason: "out" },
        { playerId: "00-0000003", group: "WR", role: 0.1, probability: 1, reason: "out" },
        { playerId: "00-0000004", group: "TE", role: 0.8, probability: 0.24, reason: "questionable" },
      ],
    };

    it("lists likely-absent regulars by role, using names when known", () => {
      expect(describeAbsence(absence, new Map([["00-0000001", "Josh Allen"]]))).toBe("Josh Allen (QB), 00-0000002 (OL)");
    });

    it("is empty without an absence", () => {
      expect(describeAbsence(undefined, new Map())).toBe("");
    });
  });
});
