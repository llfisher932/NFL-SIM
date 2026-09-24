import type { DuckDBConnection } from "@duckdb/node-api";
import type { TeamEpaRow } from "../types/data";

export async function teamEpaPerPlay(
  connection: DuckDBConnection,
  season: number,
  week: number,
): Promise<TeamEpaRow[]> {
  const reader = await connection.runAndReadAll(
    `WITH plays AS (
       SELECT posteam, defteam, epa FROM pbp
       WHERE season = $season AND week = $week
         AND (pass = 1 OR rush = 1) AND epa IS NOT NULL
     ),
     offense AS (
       SELECT posteam AS team, count(*)::INTEGER AS off_plays, avg(epa) AS off_epa
       FROM plays GROUP BY posteam
     ),
     defense AS (
       SELECT defteam AS team, count(*)::INTEGER AS def_plays, avg(epa) AS def_epa
       FROM plays GROUP BY defteam
     )
     SELECT team, off_plays, off_epa, def_plays, def_epa
     FROM offense JOIN defense USING (team)
     ORDER BY off_epa DESC, team`,
    { season, week },
  );
  return reader.getRowObjectsJS().map((row) => ({
    team: String(row["team"]),
    offPlays: Number(row["off_plays"]),
    offEpaPerPlay: Number(row["off_epa"]),
    defPlays: Number(row["def_plays"]),
    defEpaPerPlay: Number(row["def_epa"]),
  }));
}
