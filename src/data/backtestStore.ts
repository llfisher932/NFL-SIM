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
