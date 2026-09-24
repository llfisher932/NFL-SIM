import type { DuckDBConnection } from "@duckdb/node-api";
import type { SeasonSchedule, TeamGame } from "../types/features";

export const NEUTRAL_SITUATION_SQL =
  "wp BETWEEN 0.2 AND 0.8 AND down IN (1, 2) AND half_seconds_remaining > 120 AND qtr <= 4";

export async function loadTeamGames(connection: DuckDBConnection): Promise<TeamGame[]> {
  const reader = await connection.runAndReadAll(
    `SELECT
       game_id, season, week, posteam AS team, defteam AS opponent,
       count(*) FILTER (pass = 1 AND epa IS NOT NULL)::INTEGER AS pass_plays,
       coalesce(sum(epa) FILTER (pass = 1), 0) AS pass_epa,
       count(*) FILTER (rush = 1 AND epa IS NOT NULL)::INTEGER AS rush_plays,
       coalesce(sum(epa) FILTER (rush = 1), 0) AS rush_epa,
       count(*)::INTEGER AS plays,
       count(*) FILTER (${NEUTRAL_SITUATION_SQL})::INTEGER AS neutral_plays,
       count(*) FILTER (${NEUTRAL_SITUATION_SQL} AND pass = 1)::INTEGER AS neutral_passes
     FROM pbp
     WHERE (pass = 1 OR rush = 1) AND posteam IS NOT NULL AND defteam IS NOT NULL
     GROUP BY game_id, season, week, posteam, defteam
     ORDER BY season, week, game_id, team`,
  );
  return reader.getRowObjectsJS().map((row) => ({
    gameId: String(row["game_id"]),
    season: Number(row["season"]),
    week: Number(row["week"]),
    team: String(row["team"]),
    opponent: String(row["opponent"]),
    passPlays: Number(row["pass_plays"]),
    passEpa: Number(row["pass_epa"]),
    rushPlays: Number(row["rush_plays"]),
    rushEpa: Number(row["rush_epa"]),
    plays: Number(row["plays"]),
    neutralPlays: Number(row["neutral_plays"]),
    neutralPasses: Number(row["neutral_passes"]),
  }));
}

export async function loadSeasonSchedules(
  connection: DuckDBConnection,
  seasons: readonly number[],
): Promise<SeasonSchedule[]> {
  const reader = await connection.runAndReadAll(
    `SELECT season,
       list_sort(list_distinct(flatten(list([home_team, away_team])))) AS teams,
       list_sort(list_distinct(list(week))) AS weeks
     FROM schedules
     WHERE season IN (${seasons.map((s) => Math.trunc(s)).join(", ")})
     GROUP BY season ORDER BY season`,
  );
  return reader.getRowObjectsJS().map((row) => ({
    season: Number(row["season"]),
    teams: (row["teams"] as unknown[]).map(String),
    weeks: (row["weeks"] as unknown[]).map(Number),
  }));
}
