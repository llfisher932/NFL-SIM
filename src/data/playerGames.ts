import type { DuckDBConnection } from "@duckdb/node-api";
import type { PlayerGame, SkillPosition } from "../types/players";

const POSITION_MAP: Record<string, SkillPosition> = { QB: "QB", RB: "RB", FB: "RB", HB: "RB", WR: "WR", TE: "TE" };

export async function loadPlayerGames(connection: DuckDBConnection): Promise<PlayerGame[]> {
  const reader = await connection.runAndReadAll(
    `WITH red_zone AS (
       SELECT game_id, player_id, sum(rz_targets)::INTEGER AS rz_targets, sum(rz_carries)::INTEGER AS rz_carries
       FROM (
         SELECT game_id, receiver_player_id AS player_id, 1 AS rz_targets, 0 AS rz_carries
         FROM pbp
         WHERE yardline_100 <= 20 AND play_type = 'pass' AND sack = 0
           AND coalesce(two_point_attempt, 0) = 0 AND receiver_player_id IS NOT NULL
         UNION ALL
         SELECT game_id, rusher_player_id, 0, 1
         FROM pbp
         WHERE yardline_100 <= 20 AND rush_attempt = 1 AND play_type = 'run'
           AND coalesce(two_point_attempt, 0) = 0 AND rusher_player_id IS NOT NULL
       )
       GROUP BY game_id, player_id
     )
     SELECT s.player_id, s.player_display_name, s.position, s.team, s.season, s.week, s.game_id,
       s.attempts, s.completions, s.passing_yards, s.passing_tds, s.passing_interceptions,
       s.targets, s.receptions, s.receiving_yards, s.receiving_tds, s.receiving_air_yards,
       s.carries, s.rushing_yards, s.rushing_tds,
       coalesce(r.rz_targets, 0) AS rz_targets, coalesce(r.rz_carries, 0) AS rz_carries
     FROM player_weekly_stats s
     LEFT JOIN red_zone r ON r.game_id = s.game_id AND r.player_id = s.player_id
     WHERE s.position IN (${Object.keys(POSITION_MAP).map((p) => `'${p}'`).join(", ")})
     ORDER BY s.season, s.week, s.game_id, s.player_id`,
  );
  return reader.getRowObjectsJS().map((row) => ({
    playerId: String(row["player_id"]),
    name: String(row["player_display_name"]),
    position: POSITION_MAP[String(row["position"])]!,
    team: String(row["team"]),
    season: Number(row["season"]),
    week: Number(row["week"]),
    gameId: String(row["game_id"]),
    attempts: Number(row["attempts"]),
    completions: Number(row["completions"]),
    passYards: Number(row["passing_yards"]),
    passTds: Number(row["passing_tds"]),
    interceptions: Number(row["passing_interceptions"]),
    targets: Number(row["targets"]),
    receptions: Number(row["receptions"]),
    recYards: Number(row["receiving_yards"]),
    recTds: Number(row["receiving_tds"]),
    airYards: Number(row["receiving_air_yards"]),
    carries: Number(row["carries"]),
    rushYards: Number(row["rushing_yards"]),
    rushTds: Number(row["rushing_tds"]),
    rzTargets: Number(row["rz_targets"]),
    rzCarries: Number(row["rz_carries"]),
  }));
}
