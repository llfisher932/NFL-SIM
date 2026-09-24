import type { DuckDBConnection } from "@duckdb/node-api";
import type { PickSnapshot } from "../types/tracker";

// Kept apart from ingested tables so re-ingesting never erases the pre-kickoff record.
export const PICK_LOG_TABLE = "pick_log";

async function ensurePickLog(connection: DuckDBConnection): Promise<void> {
  await connection.run(
    `CREATE TABLE IF NOT EXISTS ${PICK_LOG_TABLE} (
       game_id VARCHAR, season INTEGER, week INTEGER, captured_at VARCHAR, home_team VARCHAR, away_team VARCHAR,
       model_home_win_prob DOUBLE, model_margin DOUBLE, model_total DOUBLE, spread_line DOUBLE, total_line DOUBLE,
       PRIMARY KEY (game_id, captured_at))`,
  );
}

export async function appendPickSnapshots(connection: DuckDBConnection, snapshots: readonly PickSnapshot[]): Promise<void> {
  await ensurePickLog(connection);
  const appender = await connection.createAppender(PICK_LOG_TABLE);
  for (const s of snapshots) {
    appender.appendVarchar(s.gameId);
    appender.appendInteger(s.season);
    appender.appendInteger(s.week);
    appender.appendVarchar(s.capturedAt);
    appender.appendVarchar(s.home);
    appender.appendVarchar(s.away);
    appender.appendDouble(s.modelHomeWinProb);
    appender.appendDouble(s.modelMargin);
    appender.appendDouble(s.modelTotal);
    for (const line of [s.spreadLine, s.totalLine]) {
      if (line === null) appender.appendNull();
      else appender.appendDouble(line);
    }
    appender.endRow();
  }
  appender.closeSync();
}

export async function loadPickSnapshots(connection: DuckDBConnection): Promise<PickSnapshot[]> {
  await ensurePickLog(connection);
  const reader = await connection.runAndReadAll(`SELECT * FROM ${PICK_LOG_TABLE} ORDER BY captured_at, game_id`);
  const nullable = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return reader.getRowObjectsJS().map((row) => ({
    gameId: String(row["game_id"]),
    season: Number(row["season"]),
    week: Number(row["week"]),
    capturedAt: String(row["captured_at"]),
    home: String(row["home_team"]),
    away: String(row["away_team"]),
    modelHomeWinProb: Number(row["model_home_win_prob"]),
    modelMargin: Number(row["model_margin"]),
    modelTotal: Number(row["model_total"]),
    spreadLine: nullable(row["spread_line"]),
    totalLine: nullable(row["total_line"]),
  }));
}
