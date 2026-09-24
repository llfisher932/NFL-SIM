import type { z } from "zod";
import type { DatasetId } from "../types/data";
import {
  injuryReportRowSchema,
  pbpRowSchema,
  playerRowSchema,
  playerWeeklyStatsRowSchema,
  scheduleRowSchema,
  snapCountRowSchema,
  weeklyRosterRowSchema,
} from "./schemas";

export interface TableSpec {
  table: string;
  dataset: DatasetId;
  schema: z.ZodObject;
  keySql: string;
  seasonal?: false;
}

export const TABLE_SPECS: readonly TableSpec[] = [
  {
    table: "pbp",
    dataset: "pbp",
    schema: pbpRowSchema,
    keySql: "concat_ws(':', game_id, play_id::INTEGER)",
  },
  {
    table: "schedules",
    dataset: "schedules",
    schema: scheduleRowSchema,
    keySql: "game_id",
  },
  {
    table: "player_weekly_stats",
    dataset: "player_weekly_stats",
    schema: playerWeeklyStatsRowSchema,
    keySql: "concat_ws(':', coalesce(player_id, '?'), coalesce(player_display_name, '?'), game_id)",
  },
  {
    table: "injury_reports",
    dataset: "injury_reports",
    schema: injuryReportRowSchema,
    keySql: "concat_ws(':', team, week, gsis_id)",
  },
  {
    table: "snap_counts",
    dataset: "snap_counts",
    schema: snapCountRowSchema,
    keySql: "concat_ws(':', game_id, pfr_player_id)",
  },
  {
    table: "weekly_rosters",
    dataset: "weekly_rosters",
    schema: weeklyRosterRowSchema,
    keySql: "concat_ws(':', team, week, coalesce(gsis_id, full_name))",
  },
  {
    table: "players",
    dataset: "players",
    schema: playerRowSchema,
    keySql: "coalesce(gsis_id, display_name)",
    seasonal: false,
  },
];
