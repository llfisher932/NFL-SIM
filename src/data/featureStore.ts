import type { DuckDBConnection } from "@duckdb/node-api";
import type { TeamWeekFeatures } from "../types/features";

export const FEATURES_TABLE = "team_week_features";

const DOUBLE_COLUMNS = [
  "off_epa",
  "off_pass_epa",
  "off_rush_epa",
  "def_epa",
  "def_pass_epa",
  "def_rush_epa",
  "league_epa",
  "league_pass_epa",
  "league_rush_epa",
  "plays_per_game",
  "neutral_pass_rate",
] as const;

function doubles(f: TeamWeekFeatures): number[] {
  return [
    f.offense.all,
    f.offense.pass,
    f.offense.rush,
    f.defense.all,
    f.defense.pass,
    f.defense.rush,
    f.league.all,
    f.league.pass,
    f.league.rush,
    f.playsPerGame,
    f.neutralPassRate,
  ];
}

export async function writeTeamWeekFeatures(
  connection: DuckDBConnection,
  rows: readonly TeamWeekFeatures[],
): Promise<void> {
  await connection.run(
    `CREATE OR REPLACE TABLE ${FEATURES_TABLE} (
       season INTEGER, week INTEGER, team VARCHAR, games_played INTEGER,
       ${DOUBLE_COLUMNS.map((c) => `${c} DOUBLE`).join(", ")},
       PRIMARY KEY (season, week, team))`,
  );
  const appender = await connection.createAppender(FEATURES_TABLE);
  for (const row of rows) {
    appender.appendInteger(row.season);
    appender.appendInteger(row.week);
    appender.appendVarchar(row.team);
    appender.appendInteger(row.gamesPlayed);
    for (const value of doubles(row)) appender.appendDouble(value);
    appender.endRow();
  }
  appender.closeSync();
}
