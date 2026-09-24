import type { DuckDBConnection } from "@duckdb/node-api";
import type { Availability, PlayerSnap, PositionGroup, QbDropbacks } from "../types/injuries";

const GROUP_BY_POSITION: Record<string, PositionGroup> = {
  QB: "QB",
  RB: "RB",
  FB: "RB",
  HB: "RB",
  WR: "WR",
  TE: "TE",
  T: "OL",
  G: "OL",
  C: "OL",
  OT: "OL",
  OG: "OL",
  OL: "OL",
  DE: "DL",
  DT: "DL",
  NT: "DL",
  DL: "DL",
  LB: "LB",
  ILB: "LB",
  OLB: "LB",
  MLB: "LB",
  CB: "DB",
  S: "DB",
  FS: "DB",
  SS: "DB",
  DB: "DB",
};

const DEFENSIVE = new Set<PositionGroup>(["DL", "LB", "DB"]);

export const rosterKey = (season: number, week: number, team: string) => `${season}:${week}:${team}`;

export async function loadPlayerSnaps(connection: DuckDBConnection): Promise<PlayerSnap[]> {
  const reader = await connection.runAndReadAll(
    `SELECT p.gsis_id, s.season, s.week, s.game_id, s.team, s.position, s.offense_pct, s.defense_pct
     FROM snap_counts s
     JOIN (SELECT pfr_id, any_value(gsis_id) AS gsis_id FROM players WHERE pfr_id IS NOT NULL GROUP BY pfr_id) p
       ON p.pfr_id = s.pfr_player_id
     ORDER BY s.season, s.week, s.game_id, p.gsis_id`,
  );
  return reader.getRowObjectsJS().flatMap((row) => {
    const group = GROUP_BY_POSITION[String(row["position"])];
    if (!group) return [];
    return [
      {
        playerId: String(row["gsis_id"]),
        season: Number(row["season"]),
        week: Number(row["week"]),
        gameId: String(row["game_id"]),
        team: String(row["team"]),
        group,
        snapPct: Number(DEFENSIVE.has(group) ? row["defense_pct"] : row["offense_pct"]),
      },
    ];
  });
}

export async function loadAvailability(connection: DuckDBConnection): Promise<Availability> {
  const reader = await connection.runAndReadAll(
    `WITH roster AS (
       SELECT season, week, team, gsis_id, any_value(status) AS status
       FROM weekly_rosters GROUP BY ALL
     ),
     injury AS (
       SELECT season, week, team, gsis_id, any_value(report_status) AS report_status
       FROM injury_reports WHERE report_status IS NOT NULL GROUP BY ALL
     )
     SELECT coalesce(r.season, i.season) AS season, coalesce(r.week, i.week) AS week,
       coalesce(r.team, i.team) AS team, coalesce(r.gsis_id, i.gsis_id) AS gsis_id,
       r.status AS roster_status, i.report_status AS injury_status
     FROM roster r FULL OUTER JOIN injury i
       ON r.season = i.season AND r.week = i.week AND r.team = i.team AND r.gsis_id = i.gsis_id`,
  );
  const reports = reader.getRowObjectsJS().map((row) => ({
    season: Number(row["season"]),
    week: Number(row["week"]),
    team: String(row["team"]),
    playerId: String(row["gsis_id"]),
    rosterStatus: row["roster_status"] === null ? null : String(row["roster_status"]),
    injuryStatus: row["injury_status"] === null ? null : String(row["injury_status"]),
  }));
  return {
    reports,
    rosterTeamWeeks: new Set(
      reports.filter((r) => r.rosterStatus !== null).map((r) => rosterKey(r.season, r.week, r.team)),
    ),
  };
}

export async function loadQbDropbacks(connection: DuckDBConnection): Promise<QbDropbacks[]> {
  const reader = await connection.runAndReadAll(
    `SELECT season, week, id AS player_id, count(*)::INTEGER AS dropbacks, sum(qb_epa) AS epa
     FROM pbp
     WHERE qb_dropback = 1 AND id IS NOT NULL AND qb_epa IS NOT NULL
     GROUP BY season, week, id
     ORDER BY season, week, id`,
  );
  return reader.getRowObjectsJS().map((row) => ({
    playerId: String(row["player_id"]),
    season: Number(row["season"]),
    week: Number(row["week"]),
    dropbacks: Number(row["dropbacks"]),
    epa: Number(row["epa"]),
  }));
}

export async function loadPlayerNames(connection: DuckDBConnection): Promise<Map<string, string>> {
  const reader = await connection.runAndReadAll("SELECT gsis_id, display_name FROM players");
  return new Map(reader.getRowObjectsJS().map((row) => [String(row["gsis_id"]), String(row["display_name"])]));
}
