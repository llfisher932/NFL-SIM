import type { z } from "zod";
import type {
  pbpRowSchema,
  playerWeeklyStatsRowSchema,
  scheduleRowSchema,
} from "../data/schemas";

export type PbpRow = z.infer<typeof pbpRowSchema>;
export type ScheduleRow = z.infer<typeof scheduleRowSchema>;
export type PlayerWeeklyStatsRow = z.infer<typeof playerWeeklyStatsRowSchema>;

export type DatasetId =
  | "pbp"
  | "schedules"
  | "player_weekly_stats"
  | "injury_reports"
  | "snap_counts"
  | "weekly_rosters"
  | "players";

export interface RawFile {
  dataset: DatasetId;
  season: number | null;
  url: string;
  relativePath: string;
}

export type CacheStatus = "cached" | "downloaded";

export interface CachedFile {
  file: RawFile;
  path: string;
  status: CacheStatus;
}

export interface SeasonLoadCount {
  season: number | null;
  loaded: number;
  rejected: number;
}

export interface TableLoadReport {
  table: string;
  seasons: SeasonLoadCount[];
  rejectReasons: Record<string, number>;
}

export interface TeamEpaRow {
  team: string;
  offPlays: number;
  offEpaPerPlay: number;
  defPlays: number;
  defEpaPerPlay: number;
}
