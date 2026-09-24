import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKTEST_TABLE, writeBacktestPredictions } from "../../src/data/backtestStore";
import { openDatabase, type Database } from "../../src/data/db";
import type { BacktestPrediction } from "../../src/types/eval";

const prediction: BacktestPrediction = {
  gameId: "2024_05_BAL_CIN",
  season: 2024,
  week: 5,
  home: "CIN",
  away: "BAL",
  neutralSite: false,
  homeWinProb: 0.4,
  tieProb: 0.01,
  marginMean: -2.5,
  marginP10: -18,
  marginP90: 13,
  totalMean: 50.5,
  totalP10: 34,
  totalP90: 67,
  spreadLine: -2.5,
  totalLine: 53.5,
  marketHomeWinProb: null,
  homeScore: 38,
  awayScore: 41,
};

describe("data/backtestStore", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("writeBacktestPredictions", () => {
    it("stores one row per game, keeping missing market values as NULL", async () => {
      await writeBacktestPredictions(db.connection, [prediction]);
      const rows = (await db.connection.runAndReadAll(`SELECT * FROM ${BACKTEST_TABLE}`)).getRowObjectsJS();
      expect(rows).toEqual([
        {
          game_id: "2024_05_BAL_CIN",
          season: 2024,
          week: 5,
          home_team: "CIN",
          away_team: "BAL",
          neutral_site: false,
          home_win_prob: 0.4,
          tie_prob: 0.01,
          margin_mean: -2.5,
          margin_p10: -18,
          margin_p90: 13,
          total_mean: 50.5,
          total_p10: 34,
          total_p90: 67,
          spread_line: -2.5,
          total_line: 53.5,
          market_home_win_prob: null,
          home_score: 38,
          away_score: 41,
        },
      ]);
    });

    it("replaces the previous run", async () => {
      await writeBacktestPredictions(db.connection, [prediction]);
      await writeBacktestPredictions(db.connection, [{ ...prediction, gameId: "other" }]);
      const ids = (await db.connection.runAndReadAll(`SELECT game_id FROM ${BACKTEST_TABLE}`)).getRowsJson();
      expect(ids).toEqual([["other"]]);
    });
  });
});
