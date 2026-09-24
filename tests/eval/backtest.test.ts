import { describe, expect, it } from "vitest";
import { backtestWeeks, runBacktest, type BacktestInputs, type WeekProgress } from "../../src/eval/backtest";
import { DEFAULT_FEATURE_CONFIG } from "../../src/features/config";
import type { BacktestPrediction } from "../../src/types/eval";
import type { TeamGame } from "../../src/types/features";
import type { DriveRecord, WeekGame } from "../../src/types/sim";
import { conversions, syntheticDrives, testSimConfig } from "../fixtures/drives";
import { schedule, seededRandom, syntheticTeamGames } from "../fixtures/league";

const TEAM_NAMES: Record<string, string> = { GOOD: "ARI", AVG: "BAL", BAD: "CHI" };

function scheduledGames(seasons: number[], seed = 5): WeekGame[] {
  const random = seededRandom(seed);
  return schedule(seasons).map((m) => ({
    gameId: m.gameId,
    season: m.season,
    week: m.week,
    gameType: "REG",
    home: m.home,
    away: m.away,
    neutralSite: false,
    spreadLine: 2.5,
    totalLine: 44.5,
    homeMoneyline: -140,
    awayMoneyline: 120,
    homeScore: 10 + Math.floor(random() * 25),
    awayScore: 10 + Math.floor(random() * 25),
  }));
}

const inputs: BacktestInputs = {
  teamGames: syntheticTeamGames([2022, 2023]),
  drives: syntheticDrives([2022, 2023], 7).map((d) => ({
    ...d,
    offense: TEAM_NAMES[d.offense]!,
    defense: TEAM_NAMES[d.defense]!,
  })),
  conversions: conversions(2022, 1, 90, 5, 5),
  games: scheduledGames([2023]),
};

const options = {
  seasons: [2023],
  sims: 200,
  seed: 1,
  simConfig: { ...testSimConfig, minTrainingDrives: 300 },
  featureConfig: DEFAULT_FEATURE_CONFIG,
};

const modelFields = ({ homeScore: _h, awayScore: _a, ...rest }: BacktestPrediction) => rest;

// Independent of src/features/window so a bug there cannot hide here.
const atOrAfter = (item: { season: number; week: number }, week: number) =>
  item.season > 2023 || (item.season === 2023 && item.week >= week);

describe("eval/backtest", () => {
  describe("backtestWeeks", () => {
    it("lists completed weeks of the requested seasons in order", () => {
      const games = [
        ...scheduledGames([2023]).filter((g) => g.week <= 2),
        { ...scheduledGames([2023])[0]!, gameId: "future", week: 9, homeScore: null, awayScore: null },
      ];
      expect(backtestWeeks(games, [2023])).toEqual([
        { season: 2023, week: 1 },
        { season: 2023, week: 2 },
      ]);
    });
  });

  describe("runBacktest", () => {
    const progress: WeekProgress[] = [];
    const predictions = runBacktest(inputs, options, (p) => progress.push(p));

    it("predicts every completed game once", () => {
      expect(predictions).toHaveLength(inputs.games.length);
      expect(new Set(predictions.map((p) => p.gameId)).size).toBe(inputs.games.length);
    });

    it("reports progress for each week in order", () => {
      expect(progress.map((p) => p.week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(progress.at(-1)).toMatchObject({ done: 7, total: 7 });
    });

    it("attaches the de-vigged market probability", () => {
      expect(predictions[0]!.marketHomeWinProb).toBeCloseTo((140 / 240) / (140 / 240 + 100 / 220));
    });

    it("skips games without a final score", () => {
      const unplayed = { ...inputs, games: inputs.games.map((g) => (g.week === 7 ? { ...g, homeScore: null } : g)) };
      expect(runBacktest(unplayed, options).some((p) => p.week === 7)).toBe(false);
    });

    describe.each([2, 4, 6])("walk-forward for 2023 week %i", (week) => {
      it("is unchanged when every later drive, team game and final score is rewritten", () => {
        const poisoned: BacktestInputs = {
          teamGames: inputs.teamGames.map((g): TeamGame =>
            atOrAfter(g, week) ? { ...g, passEpa: 400, rushEpa: -400, plays: 200 } : g,
          ),
          drives: inputs.drives.map((d): DriveRecord =>
            atOrAfter(d, week) ? { ...d, outcome: "touchdown", durationSeconds: 5, nextStartYardline: 1 } : d,
          ),
          conversions: [...inputs.conversions, ...conversions(2023, week, 0, 50, 0)],
          games: inputs.games.map((g) => (atOrAfter(g, week) ? { ...g, homeScore: 99, awayScore: 0 } : g)),
        };
        const pick = (rows: BacktestPrediction[]) => rows.filter((p) => p.week <= week).map(modelFields);
        expect(pick(runBacktest(poisoned, options))).toEqual(pick(predictions));
      });
    });

    it("does change a week's predictions when the previous week's drives change", () => {
      const altered = {
        ...inputs,
        drives: inputs.drives.map((d): DriveRecord => (d.season === 2023 && d.week === 3 ? { ...d, outcome: "touchdown" } : d)),
      };
      const week4 = (rows: BacktestPrediction[]) => rows.filter((p) => p.week === 4).map(modelFields);
      expect(week4(runBacktest(altered, options))).not.toEqual(week4(predictions));
    });
  });
});
