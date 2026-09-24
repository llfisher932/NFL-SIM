import type { DuckDBConnection } from "@duckdb/node-api";
import type { ConversionCount, DriveOutcome, DriveRecord, Half, WeekGame } from "../types/sim";

const OUTCOME_BY_RESULT: Record<string, DriveOutcome> = {
  Touchdown: "touchdown",
  "Field goal": "field_goal",
  "Missed field goal": "missed_field_goal",
  Punt: "punt",
  Turnover: "turnover",
  "Turnover on downs": "turnover_on_downs",
  Safety: "safety",
  "Opp touchdown": "opp_touchdown",
  "End of half": "end_of_half",
};

export async function loadDrives(connection: DuckDBConnection): Promise<DriveRecord[]> {
  const reader = await connection.runAndReadAll(
    `WITH drives AS (
       SELECT
         game_id,
         any_value(season) AS season,
         any_value(week) AS week,
         fixed_drive,
         arg_min(game_half, play_id) AS game_half,
         arg_min(posteam, play_id) FILTER (down IS NOT NULL) AS offense,
         arg_min(defteam, play_id) FILTER (down IS NOT NULL) AS defense,
         arg_min(yardline_100, play_id) FILTER (down IS NOT NULL) AS start_yardline,
         arg_max(yardline_100, play_id) FILTER (down IS NOT NULL) AS end_yardline,
         max(half_seconds_remaining) AS start_seconds,
         any_value(fixed_drive_result) AS result
       FROM pbp
       WHERE fixed_drive IS NOT NULL AND posteam IS NOT NULL
       GROUP BY game_id, fixed_drive
     ),
     sequenced AS (
       SELECT *,
         lead(start_seconds) OVER half_window AS next_start_seconds,
         lead(start_yardline) OVER half_window AS next_start_yardline
       FROM drives
       WINDOW half_window AS (PARTITION BY game_id, game_half ORDER BY fixed_drive)
     )
     SELECT game_id, season, week, game_half, offense, defense, start_yardline, end_yardline,
       start_seconds, start_seconds - coalesce(next_start_seconds, 0) AS duration_seconds,
       result, next_start_yardline
     FROM sequenced
     WHERE game_half IN ('Half1', 'Half2') AND offense IS NOT NULL AND result IS NOT NULL
       AND start_yardline IS NOT NULL AND end_yardline IS NOT NULL
     ORDER BY season, week, game_id, fixed_drive`,
  );
  return reader.getRowObjectsJS().flatMap((row) => {
    const outcome = OUTCOME_BY_RESULT[String(row["result"])];
    if (!outcome) return [];
    const next = row["next_start_yardline"];
    return [
      {
        gameId: String(row["game_id"]),
        season: Number(row["season"]),
        week: Number(row["week"]),
        half: (row["game_half"] === "Half1" ? 1 : 2) as Half,
        offense: String(row["offense"]),
        defense: String(row["defense"]),
        startYardline: Number(row["start_yardline"]),
        startSeconds: Number(row["start_seconds"]),
        endYardline: Number(row["end_yardline"]),
        outcome,
        durationSeconds: Math.max(0, Number(row["duration_seconds"])),
        nextStartYardline: next === null ? null : Number(next),
      },
    ];
  });
}

export async function loadConversionCounts(connection: DuckDBConnection): Promise<ConversionCount[]> {
  const reader = await connection.runAndReadAll(
    `SELECT season, week,
       CASE WHEN extra_point_result = 'good' THEN 1
            WHEN two_point_conv_result = 'success' THEN 2
            ELSE 0 END AS bonus_points,
       count(*)::INTEGER AS n
     FROM pbp
     WHERE extra_point_attempt = 1 OR two_point_attempt = 1
     GROUP BY ALL ORDER BY ALL`,
  );
  return reader.getRowObjectsJS().map((row) => ({
    season: Number(row["season"]),
    week: Number(row["week"]),
    bonusPoints: Number(row["bonus_points"]) as 0 | 1 | 2,
    count: Number(row["n"]),
  }));
}

const GAME_COLUMNS = `game_id, season, week, game_type, home_team, away_team, location,
  spread_line, total_line, home_moneyline, away_moneyline, home_score, away_score`;

async function loadGames(
  connection: DuckDBConnection,
  where: string,
  params: Record<string, number>,
): Promise<WeekGame[]> {
  const reader = await connection.runAndReadAll(
    `SELECT ${GAME_COLUMNS} FROM schedules WHERE ${where} ORDER BY season, week, gameday, gametime, game_id`,
    params,
  );
  const nullableNumber = (value: unknown) => (value === null ? null : Number(value));
  return reader.getRowObjectsJS().map((row) => ({
    gameId: String(row["game_id"]),
    season: Number(row["season"]),
    week: Number(row["week"]),
    gameType: String(row["game_type"]),
    home: String(row["home_team"]),
    away: String(row["away_team"]),
    neutralSite: row["location"] === "Neutral",
    spreadLine: nullableNumber(row["spread_line"]),
    totalLine: nullableNumber(row["total_line"]),
    homeMoneyline: nullableNumber(row["home_moneyline"]),
    awayMoneyline: nullableNumber(row["away_moneyline"]),
    homeScore: nullableNumber(row["home_score"]),
    awayScore: nullableNumber(row["away_score"]),
  }));
}

export function loadWeekGames(connection: DuckDBConnection, season: number, week: number): Promise<WeekGame[]> {
  return loadGames(connection, "season = $season AND week = $week", { season, week });
}

export function loadSeasonGames(connection: DuckDBConnection, seasons: readonly number[]): Promise<WeekGame[]> {
  const list = seasons.map((s) => Math.trunc(s)).join(", ");
  return loadGames(connection, `season IN (${list})`, {});
}
