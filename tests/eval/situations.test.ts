import { describe, expect, it } from "vitest";
import { SITUATIONS, gameSituations, gradePick, sidePick, situationRecord, winRate } from "../../src/eval/situations";
import type { BacktestPrediction } from "../../src/types/eval";
import type { SituationInput } from "../../src/types/situations";
import type { TrackedPick } from "../../src/types/tracker";

const input = (overrides: Partial<SituationInput> = {}): SituationInput => ({
  week: 5,
  postseason: false,
  home: "NYG",
  away: "TEN",
  modelMargin: 6,
  modelTotal: 44,
  spreadLine: 3,
  totalLine: 41.5,
  ...overrides,
});

const prediction = (overrides: Partial<BacktestPrediction> = {}): BacktestPrediction => ({
  gameId: "2024_05_TEN_NYG",
  season: 2024,
  week: 5,
  home: "NYG",
  away: "TEN",
  neutralSite: false,
  homeWinProb: 0.65,
  tieProb: 0,
  marginMean: 6,
  marginP10: -8,
  marginP90: 20,
  totalMean: 44,
  totalP10: 30,
  totalP90: 58,
  spreadLine: 3,
  totalLine: 41.5,
  marketHomeWinProb: 0.6,
  homeScore: 27,
  awayScore: 17,
  ...overrides,
});

const situation = (id: string) => SITUATIONS.find((s) => s.id === id)!;

describe("eval/situations", () => {
  describe("SITUATIONS", () => {
    it("flags playoff games only in the postseason", () => {
      expect(situation("playoffs").applies(input({ postseason: true }))).toBe(true);
      expect(situation("playoffs").applies(input())).toBe(false);
    });

    it("flags a disagreement of 5 or more points with the spread", () => {
      expect(situation("disagree-5").applies(input({ modelMargin: 8 }))).toBe(true);
      expect(situation("disagree-5").applies(input({ modelMargin: 7.9 }))).toBe(false);
    });

    it("flags a disagreement of 3 or more points with the spread", () => {
      expect(situation("disagree-3").applies(input({ modelMargin: 6 }))).toBe(true);
      expect(situation("disagree-3").applies(input({ modelMargin: 5.9 }))).toBe(false);
    });

    it("flags a 7+ point favorite either way", () => {
      expect(situation("big-spread").applies(input({ spreadLine: -7 }))).toBe(true);
      expect(situation("big-spread").applies(input({ spreadLine: 6.5 }))).toBe(false);
    });

    it("flags totals in the first four regular-season weeks", () => {
      expect(situation("early-total").applies(input({ week: 4 }))).toBe(true);
      expect(situation("early-total").applies(input({ week: 5 }))).toBe(false);
    });
  });

  describe("sidePick", () => {
    it("takes the home favorite laying the points when the model likes home more", () => {
      expect(sidePick("spread", input())).toMatchObject({ side: "NYG", gap: 3, bet: "NYG −3" });
    });

    it("takes the away underdog getting the points when the model likes home less", () => {
      expect(sidePick("spread", input({ modelMargin: 1 }))?.bet).toBe("TEN +3");
    });

    it("takes a home underdog getting points", () => {
      expect(sidePick("spread", input({ spreadLine: -2.5, modelMargin: 1 }))?.bet).toBe("NYG +2.5");
    });

    it("labels totals as over or under", () => {
      expect(sidePick("total", input())?.bet).toBe("Over 41.5");
      expect(sidePick("total", input({ modelTotal: 40 }))?.bet).toBe("Under 41.5");
    });

    it("makes no pick without a line or when the model matches it", () => {
      expect(sidePick("spread", input({ spreadLine: null }))).toBeNull();
      expect(sidePick("spread", input({ modelMargin: 3 }))).toBeNull();
    });
  });

  describe("gradePick", () => {
    it("wins when the picked side covers", () => {
      expect(gradePick("spread", 3, 3, { home: 27, away: 17 })).toBe("win");
    });

    it("loses when it does not", () => {
      expect(gradePick("spread", 3, 3, { home: 20, away: 19 })).toBe("loss");
    });

    it("pushes on the line", () => {
      expect(gradePick("total", 1, 41, { home: 21, away: 20 })).toBe("push");
    });
  });

  describe("situationRecord", () => {
    const predictions = [
      prediction(),
      prediction({ gameId: "a", homeScore: 20, awayScore: 19 }),
      prediction({ gameId: "b", season: 2023, homeScore: 30, awayScore: 10 }),
      prediction({ gameId: "c", season: 2023, marginMean: 3.5 }),
    ];
    const record = situationRecord(situation("disagree-3"), predictions);

    it("grades every matching game", () => {
      expect(record).toMatchObject({ games: 3, wins: 2, losses: 1, pushes: 0 });
    });

    it("breaks the record down by season", () => {
      expect(record.seasons).toEqual([
        { season: 2023, wins: 1, losses: 0, pushes: 0 },
        { season: 2024, wins: 1, losses: 1, pushes: 0 },
      ]);
    });

    it("counts seasons above the betting break-even", () => {
      expect(record.seasonsAboveBreakEven).toBe(1);
    });

    it("measures margin accuracy against the spread, positive when the model is closer", () => {
      const closer = situationRecord(situation("disagree-3"), [prediction({ homeScore: 24, awayScore: 17 })]);
      expect(closer.marginEdge).toBeCloseTo(4 - 1, 9);
    });

    it("says the model beats Vegas only when both its probabilities and margins are more accurate", () => {
      const better = situationRecord(situation("disagree-3"), [prediction({ homeScore: 23, awayScore: 17, marketHomeWinProb: 0.55 })]);
      expect(better.beatsVegas).toBe(true);
      const worse = situationRecord(situation("disagree-3"), [prediction({ homeScore: 17, awayScore: 20 })]);
      expect(worse.beatsVegas).toBe(false);
    });

    it("qualifies only when it beats break-even overall and in most seasons", () => {
      expect(record.qualifies).toBe(false);
      expect(situationRecord(situation("disagree-3"), [prediction()]).qualifies).toBe(true);
    });

    it("reports the first and last backtest seasons", () => {
      expect([record.firstSeason, record.lastSeason]).toEqual([2023, 2024]);
    });

    it("tallies this season's tracked picks that fit the situation", () => {
      const tracked: TrackedPick = {
        gameId: "2026_05_TEN_NYG",
        season: 2026,
        week: 5,
        home: "NYG",
        away: "TEN",
        kickoff: null,
        capturedAt: "2026-10-04T11:00:00.000Z",
        started: true,
        postseason: false,
        modelMargin: 6,
        modelTotal: 44,
        spread: { side: "NYG", gap: 3, line: 3, closingLine: 3.5, clv: 0.5, result: "win" },
        total: null,
        final: { home: 27, away: 17 },
      };
      expect(situationRecord(situation("disagree-3"), [], [tracked]).live).toEqual({ picks: 1, wins: 1, losses: 0, pushes: 0 });
    });
  });

  describe("winRate", () => {
    it("ignores pushes and is null without decisions", () => {
      expect(winRate({ wins: 3, losses: 1, pushes: 2 })).toBe(0.75);
      expect(winRate({ wins: 0, losses: 0, pushes: 1 })).toBeNull();
    });
  });

  describe("gameSituations", () => {
    const records = new Map([["disagree-3", situationRecord(situation("disagree-3"), [prediction()])]] as const);

    it("lists the model's pick for each qualifying situation the game fits", () => {
      const spots = gameSituations(input({ week: 2 }), null, records);
      expect(spots.map((s) => [s.situation, s.bet])).toEqual([["disagree-3", "NYG −3"]]);
    });

    it("flags nothing for a situation without a winning record", () => {
      const losing = new Map([
        ["disagree-3", situationRecord(situation("disagree-3"), [prediction({ homeScore: 17, awayScore: 20 })])],
      ] as const);
      expect(gameSituations(input(), null, losing)).toEqual([]);
    });

    it("attaches the situation's historical record when known", () => {
      const [spot] = gameSituations(input(), null, records);
      expect(spot?.record).toMatchObject({ wins: 1, losses: 0, seasons: 1, seasonsAboveBreakEven: 1 });
    });

    it("grades the pick once the game is final", () => {
      expect(gameSituations(input(), { home: 20, away: 19 }, records)[0]?.result).toBe("loss");
    });

    it("is empty for a game that fits no situation", () => {
      expect(gameSituations(input({ modelMargin: 4 }), null, records)).toEqual([]);
    });
  });
});
