import type { DuckDBAppender, DuckDBConnection } from "@duckdb/node-api";
import type { BacktestPrediction } from "../types/eval";

export const BACKTEST_TABLE = "backtest_predictions";

function appendNullableDouble(appender: DuckDBAppender, value: number | null): void {
  if (value === null) appender.appendNull();
  else appender.appendDouble(value);
}

export async function writeBacktestPredictions(
  connection: DuckDBConnection,
  predictions: readonly BacktestPrediction[],
): Promise<void> {
  await connection.run(
    `CREATE OR REPLACE TABLE ${BACKTEST_TABLE} (
       game_id VARCHAR PRIMARY KEY, season INTEGER, week INTEGER, home_team VARCHAR, away_team VARCHAR,
       neutral_site BOOLEAN, home_win_prob DOUBLE, tie_prob DOUBLE,
       margin_mean DOUBLE, margin_p10 DOUBLE, margin_p90 DOUBLE,
       total_mean DOUBLE, total_p10 DOUBLE, total_p90 DOUBLE,
       spread_line DOUBLE, total_line DOUBLE, market_home_win_prob DOUBLE,
       home_score INTEGER, away_score INTEGER)`,
  );
  const appender = await connection.createAppender(BACKTEST_TABLE);
  for (const p of predictions) {
    appender.appendVarchar(p.gameId);
    appender.appendInteger(p.season);
    appender.appendInteger(p.week);
    appender.appendVarchar(p.home);
    appender.appendVarchar(p.away);
    appender.appendBoolean(p.neutralSite);
    for (const value of [
      p.homeWinProb,
      p.tieProb,
      p.marginMean,
      p.marginP10,
      p.marginP90,
      p.totalMean,
      p.totalP10,
      p.totalP90,
    ]) {
      appender.appendDouble(value);
    }
    appendNullableDouble(appender, p.spreadLine);
    appendNullableDouble(appender, p.totalLine);
    appendNullableDouble(appender, p.marketHomeWinProb);
    appender.appendInteger(p.homeScore);
    appender.appendInteger(p.awayScore);
    appender.endRow();
  }
  appender.closeSync();
}

export async function loadBacktestPredictions(connection: DuckDBConnection): Promise<BacktestPrediction[] | null> {
  const exists = await connection.runAndReadAll(
    `SELECT count(*)::INTEGER AS n FROM information_schema.tables WHERE table_name = '${BACKTEST_TABLE}'`,
  );
  if (Number(exists.getRowObjectsJS()[0]?.["n"]) === 0) return null;
  const reader = await connection.runAndReadAll(`SELECT * FROM ${BACKTEST_TABLE} ORDER BY season, week, game_id`);
  const nullable = (v: unknown) => (v === null ? null : Number(v));
  return reader.getRowObjectsJS().map((r) => ({
    gameId: String(r["game_id"]),
    season: Number(r["season"]),
    week: Number(r["week"]),
    home: String(r["home_team"]),
    away: String(r["away_team"]),
    neutralSite: Boolean(r["neutral_site"]),
    homeWinProb: Number(r["home_win_prob"]),
    tieProb: Number(r["tie_prob"]),
    marginMean: Number(r["margin_mean"]),
    marginP10: Number(r["margin_p10"]),
    marginP90: Number(r["margin_p90"]),
    totalMean: Number(r["total_mean"]),
    totalP10: Number(r["total_p10"]),
    totalP90: Number(r["total_p90"]),
    spreadLine: nullable(r["spread_line"]),
    totalLine: nullable(r["total_line"]),
    marketHomeWinProb: nullable(r["market_home_win_prob"]),
    homeScore: Number(r["home_score"]),
    awayScore: Number(r["away_score"]),
  }));
}
