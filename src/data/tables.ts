import type { z } from "zod";
import type { DatasetId } from "../types/data";
import { pbpRowSchema, playerWeeklyStatsRowSchema, scheduleRowSchema } from "./schemas";

export interface TableSpec {
  table: string;
  dataset: DatasetId;
  schema: z.ZodObject;
  keySql: string;
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
];
