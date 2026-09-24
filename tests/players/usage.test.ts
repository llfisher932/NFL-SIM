import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYER_CONFIG } from "../../src/players/config";
import { estimateTeamUsage, positionEfficiency } from "../../src/players/usage";
import type { PlayerOverride, PlayerUsage } from "../../src/types/players";
import { buffaloHistory, playerGame } from "../fixtures/players";

const config = DEFAULT_PLAYER_CONFIG;
const target = { season: 2024, week: 5 };
const history = buffaloHistory();
const usage = (overrides: PlayerOverride[] = [], games = history) => estimateTeamUsage(games, "BUF", target, overrides, config);
const byName = (players: readonly PlayerUsage[], name: string) => players.find((p) => p.name === name);

describe("players/usage", () => {
  describe("estimateTeamUsage", () => {
    describe("rotation", () => {
      it("includes players who appeared for the team in its recent games", () => {
        expect(usage().players.map((p) => p.name).sort()).toEqual(["BACKUP", "QB1", "RB1", "TE1", "WR1", "WR2"]);
      });

      it("excludes players from other teams", () => {
        expect(byName(usage().players, "KCWR")).toBeUndefined();
      });

      it("excludes players whose latest game was for another team", () => {
        const traded = [...history, playerGame({ playerId: "00-0000002", name: "WR1", team: "KC", gameId: "2024_04_KC", week: 4, targets: 5 })];
        expect(byName(usage([], traded).players, "WR1")).toBeUndefined();
      });

      it("drops players who have not appeared in the last three team games", () => {
        const games = [...history.filter((g) => g.playerId !== "00-0000005"), ...buffaloHistory([1]).filter((g) => g.playerId === "00-0000005")];
        expect(byName(usage([], games).players, "TE1")).toBeUndefined();
      });
    });

    describe("shares", () => {
      it("gives the lead receiver the largest target share", () => {
        const players = usage().players;
        expect(byName(players, "WR1")!.targetShare).toBeGreaterThan(byName(players, "WR2")!.targetShare);
      });

      it("keeps the rotation's total share equal to what it recently received", () => {
        const players = usage().players;
        expect(players.reduce((s, p) => s + p.targetShare, 0)).toBeCloseTo(1, 9);
        expect(players.reduce((s, p) => s + p.carryShare, 0)).toBeCloseTo(1, 9);
      });

      it("shrinks a backup with one appearance well below a regular", () => {
        const players = usage().players;
        expect(byName(players, "BACKUP")!.carryShare).toBeLessThan(byName(players, "RB1")!.carryShare / 5);
      });

      it("weights recent games more heavily", () => {
        const surge = history.map((g) => (g.playerId === "00-0000003" && g.week === 4 ? { ...g, targets: 16 } : g));
        const early = history.map((g) => (g.playerId === "00-0000003" && g.week === 1 ? { ...g, targets: 16 } : g));
        expect(byName(usage([], surge).players, "WR2")!.targetShare).toBeGreaterThan(byName(usage([], early).players, "WR2")!.targetShare);
      });

      it("shrinks red-zone share toward the overall share", () => {
        const te = byName(usage().players, "TE1")!;
        expect(te.rzTargetShare).toBeGreaterThan(0);
        expect(te.rzTargetShare).toBeLessThan(1 / 3);
      });
    });

    describe("efficiency", () => {
      it("regresses catch rate toward the position mean", () => {
        const rb = byName(usage().players, "RB1")!;
        const positionMean = positionEfficiency(history).get("RB")!.catchRate;
        expect(rb.catchRate).toBeLessThanOrEqual(1);
        expect(rb.catchRate).toBeGreaterThanOrEqual(positionMean - 1e-9);
      });

      it("expects more yards per target from a deep threat with the same history", () => {
        const deep = history.map((g) => (g.playerId === "00-0000003" ? { ...g, airYards: 150 } : g));
        const shallow = history.map((g) => (g.playerId === "00-0000003" ? { ...g, airYards: 10 } : g));
        expect(byName(usage([], deep).players, "WR2")!.yardsPerTarget).toBeGreaterThan(
          byName(usage([], shallow).players, "WR2")!.yardsPerTarget,
        );
      });
    });

    describe("starting quarterback", () => {
      it("picks the QB with the most attempts in the latest game", () => {
        expect(usage().starterQb).toBe("00-0000001");
      });

      it("falls back to the next QB when the starter is ruled out", () => {
        expect(usage([{ ...target, playerId: "00-0000001", status: "out" }]).starterQb).toBe("00-0000006");
      });
    });

    describe("overrides", () => {
      it("removes a player ruled out", () => {
        expect(byName(usage([{ ...target, playerId: "00-0000002", status: "out" }]).players, "WR1")).toBeUndefined();
      });

      it("redistributes an absent player's targets to teammates", () => {
        const before = byName(usage().players, "WR2")!.targetShare;
        const after = byName(usage([{ ...target, playerId: "00-0000002", status: "out" }]).players, "WR2")!.targetShare;
        expect(after).toBeGreaterThan(before);
      });

      it("pins an explicit share and scales the rest around it", () => {
        const players = usage([{ ...target, playerId: "00-0000003", targetShare: 0.4 }]).players;
        expect(byName(players, "WR2")!.targetShare).toBe(0.4);
        expect(players.reduce((s, p) => s + p.targetShare, 0)).toBeCloseTo(1, 9);
      });

      it("scales a partly playing receiver's share by the fraction he plays", () => {
        const before = byName(usage().players, "WR1")!.targetShare;
        const after = byName(usage([{ ...target, playerId: "00-0000002", playing: 0.4 }]).players, "WR1")!.targetShare;
        expect(after).toBeCloseTo(before * 0.4, 9);
      });

      it("hands a partly playing receiver's lost share to teammates", () => {
        const before = byName(usage().players, "WR2")!.targetShare;
        const after = byName(usage([{ ...target, playerId: "00-0000002", playing: 0.4 }]).players, "WR2")!.targetShare;
        expect(after).toBeGreaterThan(before);
      });

      it("adds a new player with position-average efficiency", () => {
        const rookie: PlayerOverride = { ...target, playerId: "00-0000010", team: "BUF", name: "Rookie", position: "WR", targetShare: 0.1 };
        const added = byName(usage([rookie]).players, "Rookie")!;
        expect(added).toMatchObject({ targetShare: 0.1, gamesInWindow: 0 });
      });

      it("rejects a new player without a name and position", () => {
        expect(() => usage([{ ...target, playerId: "00-0000010", team: "BUF", targetShare: 0.1 }])).toThrow(
          "override for new player 00-0000010 needs name and position",
        );
      });

      it("ignores overrides for other weeks", () => {
        expect(byName(usage([{ season: 2024, week: 6, playerId: "00-0000002", status: "out" }]).players, "WR1")).toBeDefined();
      });
    });

    describe("no future data", () => {
      it("is unchanged by games in or after the target week", () => {
        const future = buffaloHistory([5, 6]).map((g) => ({ ...g, targets: g.targets * 5, carries: 30, recYards: 400 }));
        expect(usage([], [...history, ...future])).toEqual(usage());
      });
    });
  });
});
