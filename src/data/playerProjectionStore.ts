import type { DuckDBConnection } from "@duckdb/node-api";
import type { SeasonWeek } from "../types/features";
import type { PlayerProjection, StatSummary } from "../types/players";

export const PLAYER_PROJECTIONS_TABLE = "player_projections";

const SUMMARIES = ["receptions", "rec_yards", "rush_yards", "pass_yards", "touchdowns"] as const;

const summaryColumns = SUMMARIES.flatMap((s) => [`${s}_mean`, `${s}_p10`, `${s}_p50`, `${s}_p90`]);

export async function writePlayerProjections(
  connection: DuckDBConnection,
  target: SeasonWeek,
  projections: readonly PlayerProjection[],
): Promise<void> {
  await connection.run(
    `CREATE TABLE IF NOT EXISTS ${PLAYER_PROJECTIONS_TABLE} (
       season INTEGER, week INTEGER, game_id VARCHAR, player_id VARCHAR, name VARCHAR, position VARCHAR,
       team VARCHAR, opponent VARCHAR, starter_qb BOOLEAN, targets DOUBLE, carries DOUBLE,
       ${summaryColumns.map((c) => `${c} DOUBLE`).join(", ")},
       pass_tds DOUBLE, interceptions DOUBLE, anytime_td_prob DOUBLE,
       PRIMARY KEY (season, week, player_id))`,
  );
  await connection.run(`DELETE FROM ${PLAYER_PROJECTIONS_TABLE} WHERE season = $season AND week = $week`, {
    season: target.season,
    week: target.week,
  });
  const appender = await connection.createAppender(PLAYER_PROJECTIONS_TABLE);
  const appendSummary = (s: StatSummary) => {
    for (const v of [s.mean, s.p10, s.p50, s.p90]) appender.appendDouble(v);
  };
  for (const p of projections) {
    appender.appendInteger(target.season);
    appender.appendInteger(target.week);
    appender.appendVarchar(p.gameId);
    appender.appendVarchar(p.playerId);
    appender.appendVarchar(p.name);
    appender.appendVarchar(p.position);
    appender.appendVarchar(p.team);
    appender.appendVarchar(p.opponent);
    appender.appendBoolean(p.starterQb);
    appender.appendDouble(p.targets);
    appender.appendDouble(p.carries);
    for (const s of [p.receptions, p.recYards, p.rushYards, p.passYards, p.touchdowns]) appendSummary(s);
    appender.appendDouble(p.passTds);
    appender.appendDouble(p.interceptions);
    appender.appendDouble(p.anytimeTdProb);
    appender.endRow();
  }
  appender.closeSync();
}
