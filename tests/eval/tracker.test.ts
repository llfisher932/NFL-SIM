import { describe, expect, it } from "vitest";
import { easternToUtc, hasStarted, summarizeLine, trackerReport, trackPicks } from "../../src/eval/tracker";
import type { WeekGame } from "../../src/types/sim";
import type { LinePick, PickSnapshot } from "../../src/types/tracker";

const game = (overrides: Partial<WeekGame> = {}): WeekGame => ({
  gameId: "2026_03_TEN_NYG",
  season: 2026,
  week: 3,
  gameType: "REG",
  kickoff: "2026-09-27T13:00",
  home: "NYG",
  away: "TEN",
  neutralSite: false,
  spreadLine: 3.5,
  totalLine: 40.5,
  homeMoneyline: null,
  awayMoneyline: null,
  homeScore: null,
  awayScore: null,
  ...overrides,
});

const snapshot = (capturedAt: string, overrides: Partial<PickSnapshot> = {}): PickSnapshot => ({
  gameId: "2026_03_TEN_NYG",
  season: 2026,
  week: 3,
  capturedAt,
  home: "NYG",
  away: "TEN",
  modelHomeWinProb: 0.6,
  modelMargin: 6,
  modelTotal: 44,
  spreadLine: 2.5,
  totalLine: 41.5,
  ...overrides,
});

const beforeKickoff = new Date("2026-09-25T12:00:00Z");
const afterGame = new Date("2026-09-28T12:00:00Z");

describe("eval/tracker", () => {
  describe("easternToUtc", () => {
    it("adds four hours during daylight time", () => {
      expect(easternToUtc("2026-09-27T13:00").toISOString()).toBe("2026-09-27T17:00:00.000Z");
    });

    it("adds five hours after daylight time ends in November", () => {
      expect(easternToUtc("2026-11-08T13:00").toISOString()).toBe("2026-11-08T18:00:00.000Z");
    });

    it("switches on the first Sunday of November", () => {
      expect(easternToUtc("2026-10-31T13:00").toISOString()).toBe("2026-10-31T17:00:00.000Z");
      expect(easternToUtc("2026-11-01T13:00").toISOString()).toBe("2026-11-01T18:00:00.000Z");
    });

    it("uses standard time in January", () => {
      expect(easternToUtc("2027-01-10T16:30").toISOString()).toBe("2027-01-10T21:30:00.000Z");
    });
  });

  describe("hasStarted", () => {
    it("is false before kickoff", () => {
      expect(hasStarted(game(), beforeKickoff)).toBe(false);
    });

    it("is true after kickoff", () => {
      expect(hasStarted(game(), new Date("2026-09-27T17:01:00Z"))).toBe(true);
    });

    it("is true once a score exists", () => {
      expect(hasStarted(game({ homeScore: 3, awayScore: 0 }), beforeKickoff)).toBe(true);
    });
  });

  describe("trackPicks", () => {
    it("keeps the latest snapshot before kickoff as the pick", () => {
      const snapshots = [snapshot("2026-09-24T11:00:00.000Z", { modelMargin: 1 }), snapshot("2026-09-26T11:00:00.000Z", { modelMargin: 6 })];
      expect(trackPicks(snapshots, [game()], beforeKickoff)[0]!.modelMargin).toBe(6);
    });

    it("ignores snapshots taken after kickoff", () => {
      const snapshots = [snapshot("2026-09-26T11:00:00.000Z", { modelMargin: 6 }), snapshot("2026-09-27T18:00:00.000Z", { modelMargin: -9 })];
      expect(trackPicks(snapshots, [game()], afterGame)[0]!.modelMargin).toBe(6);
    });

    it("takes the home side when the model's margin beats the line", () => {
      expect(trackPicks([snapshot("2026-09-26T11:00:00.000Z")], [game()], beforeKickoff)[0]!.spread).toMatchObject({ side: "NYG", gap: 3.5, line: 2.5 });
    });

    it("takes the away side when the model's margin is below the line", () => {
      const pick = trackPicks([snapshot("2026-09-26T11:00:00.000Z", { modelMargin: -1 })], [game()], beforeKickoff)[0]!;
      expect(pick.spread?.side).toBe("TEN");
    });

    it("grades the pick against the line at pick time", () => {
      const final = game({ homeScore: 24, awayScore: 21 });
      expect(trackPicks([snapshot("2026-09-26T11:00:00.000Z")], [final], afterGame)[0]!.spread?.result).toBe("win");
    });

    it("grades a push when the margin lands on the line", () => {
      const final = game({ homeScore: 22, awayScore: 20 });
      const pick = trackPicks([snapshot("2026-09-26T11:00:00.000Z", { spreadLine: 2 })], [final], afterGame)[0]!;
      expect(pick.spread?.result).toBe("push");
    });

    it("measures closing line value toward the model's side", () => {
      const pick = trackPicks([snapshot("2026-09-26T11:00:00.000Z")], [game({ homeScore: 10, awayScore: 20 })], afterGame)[0]!;
      expect(pick.spread?.clv).toBeCloseTo(1, 9);
    });

    it("counts a line moving away from the model as negative value", () => {
      const pick = trackPicks([snapshot("2026-09-26T11:00:00.000Z", { modelMargin: -1 })], [game({ homeScore: 10, awayScore: 20 })], afterGame)[0]!;
      expect(pick.spread?.clv).toBeCloseTo(-1, 9);
    });

    it("leaves the closing line open until kickoff", () => {
      expect(trackPicks([snapshot("2026-09-26T11:00:00.000Z")], [game()], beforeKickoff)[0]!.spread).toMatchObject({ closingLine: null, clv: null });
    });

    it("grades the total as over or under", () => {
      const pick = trackPicks([snapshot("2026-09-26T11:00:00.000Z")], [game({ homeScore: 30, awayScore: 17 })], afterGame)[0]!;
      expect(pick.total).toMatchObject({ side: "over", result: "win" });
    });

    it("makes no pick without a line", () => {
      expect(trackPicks([snapshot("2026-09-26T11:00:00.000Z", { spreadLine: null })], [game()], beforeKickoff)[0]!.spread).toBeNull();
    });

    it("drops snapshots for games no longer on the schedule", () => {
      expect(trackPicks([snapshot("2026-09-26T11:00:00.000Z", { gameId: "gone" })], [game()], beforeKickoff)).toEqual([]);
    });
  });

  describe("summarizeLine", () => {
    const pick = (gap: number, result: LinePick["result"], clv: number | null): LinePick => ({ side: "NYG", gap, line: 0, closingLine: 0, clv, result });
    const picks = [pick(1, "win", 0.5), pick(-4, "loss", -1), pick(6, "win", 1.5), pick(5.5, "push", null), null];

    it("counts wins, losses and pushes", () => {
      expect(summarizeLine(picks, 0)).toMatchObject({ picks: 4, wins: 2, losses: 1, pushes: 1 });
    });

    it("keeps only picks at least the minimum gap from the line", () => {
      expect(summarizeLine(picks, 5)).toMatchObject({ picks: 2, wins: 1, pushes: 1 });
    });

    it("averages closing line value over picks that have it", () => {
      expect(summarizeLine(picks, 0).averageClv).toBeCloseTo(1 / 3, 9);
    });

    it("has no closing line value without closed picks", () => {
      expect(summarizeLine([], 0).averageClv).toBeNull();
    });
  });

  describe("trackerReport", () => {
    it("reports one season at each disagreement threshold", () => {
      const picks = trackPicks([snapshot("2026-09-26T11:00:00.000Z")], [game()], beforeKickoff);
      const report = trackerReport(2026, picks);
      expect(report.spread.map((l) => l.minGap)).toEqual([0, 3, 5]);
      expect(report.picks).toHaveLength(1);
      expect(trackerReport(2025, picks).picks).toEqual([]);
    });
  });
});
