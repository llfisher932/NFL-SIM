import { z } from "zod";

const TEAM = /^[A-Z]{2,3}$/;
const GAME_ID = /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/;
const GSIS_ID = /^00-\d{7}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^\d{2}:\d{2}$/;

const issueMessage = (field: string) => (issue: { input?: unknown }) =>
  issue.input == null ? `missing ${field}` : `invalid ${field}`;

const text = (field: string) =>
  z.string({ error: issueMessage(field) }).min(1, `missing ${field}`);

const matching = (field: string, pattern: RegExp) =>
  z.string({ error: issueMessage(field) }).regex(pattern, `invalid ${field}`);

const int = (field: string, min: number, max: number) =>
  z
    .int({ error: issueMessage(field) })
    .min(min, `invalid ${field}`)
    .max(max, `invalid ${field}`);

const num = (field: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) =>
  z
    .number({ error: issueMessage(field) })
    .min(min, `invalid ${field}`)
    .max(max, `invalid ${field}`);

const flag = (field: string) => int(field, 0, 1);
const count = (field: string) => int(field, 0, 200);
const yards = (field: string) => int(field, -200, 1000);
const team = (field: string) => matching(field, TEAM);
const season = int("season", 1999, 2100);
const week = int("week", 1, 22);

const oneOf = <const T extends readonly [string, ...string[]]>(field: string, values: T) =>
  z.enum(values, { error: issueMessage(field) });

export const PLAY_TYPES = [
  "pass",
  "run",
  "punt",
  "field_goal",
  "kickoff",
  "extra_point",
  "qb_kneel",
  "qb_spike",
  "no_play",
] as const;

export const DRIVE_RESULTS = [
  "Touchdown",
  "Field goal",
  "Punt",
  "Turnover",
  "Turnover on downs",
  "Missed field goal",
  "End of half",
  "Safety",
  "Opp touchdown",
] as const;

export const pbpRowSchema = z.object({
  game_id: matching("game_id", GAME_ID),
  play_id: int("play_id", 0, 1_000_000),
  season,
  week,
  season_type: oneOf("season_type", ["REG", "POST"]),
  game_date: matching("game_date", ISO_DATE),
  home_team: team("home_team"),
  away_team: team("away_team"),
  posteam: team("posteam").nullable(),
  defteam: team("defteam").nullable(),
  play_type: oneOf("play_type", PLAY_TYPES).nullable(),
  qtr: int("qtr", 1, 6),
  down: int("down", 1, 4).nullable(),
  ydstogo: int("ydstogo", 0, 100).nullable(),
  yardline_100: num("yardline_100", 0, 100).nullable(),
  game_seconds_remaining: num("game_seconds_remaining", 0, 3600).nullable(),
  half_seconds_remaining: num("half_seconds_remaining", 0, 1800).nullable(),
  yards_gained: yards("yards_gained").nullable(),
  epa: num("epa", -20, 20).nullable(),
  wp: num("wp", 0, 1).nullable(),
  success: flag("success").nullable(),
  pass: flag("pass"),
  rush: flag("rush"),
  pass_attempt: flag("pass_attempt").nullable(),
  rush_attempt: flag("rush_attempt").nullable(),
  qb_dropback: flag("qb_dropback").nullable(),
  sack: flag("sack").nullable(),
  complete_pass: flag("complete_pass").nullable(),
  interception: flag("interception").nullable(),
  fumble_lost: flag("fumble_lost").nullable(),
  touchdown: flag("touchdown").nullable(),
  air_yards: yards("air_yards").nullable(),
  passer_player_id: matching("passer_player_id", GSIS_ID).nullable(),
  rusher_player_id: matching("rusher_player_id", GSIS_ID).nullable(),
  receiver_player_id: matching("receiver_player_id", GSIS_ID).nullable(),
  fixed_drive: int("fixed_drive", 0, 100).nullable(),
  fixed_drive_result: oneOf("fixed_drive_result", DRIVE_RESULTS).nullable(),
  drive_start_yard_line: z.string({ error: issueMessage("drive_start_yard_line") }).nullable(),
  home_score: int("home_score", 0, 150),
  away_score: int("away_score", 0, 150),
  spread_line: num("spread_line", -50, 50).nullable(),
  total_line: num("total_line", 10, 100).nullable(),
});

export const scheduleRowSchema = z
  .object({
    game_id: matching("game_id", GAME_ID),
    season,
    game_type: oneOf("game_type", ["REG", "WC", "DIV", "CON", "SB"]),
    week,
    gameday: matching("gameday", ISO_DATE),
    gametime: matching("gametime", CLOCK_TIME).nullable(),
    home_team: team("home_team"),
    away_team: team("away_team"),
    home_score: int("home_score", 0, 150).nullable(),
    away_score: int("away_score", 0, 150).nullable(),
    result: int("result", -150, 150).nullable(),
    total: int("total", 0, 300).nullable(),
    location: oneOf("location", ["Home", "Neutral"]),
    home_rest: int("home_rest", 0, 365).nullable(),
    away_rest: int("away_rest", 0, 365).nullable(),
    spread_line: num("spread_line", -50, 50).nullable(),
    total_line: num("total_line", 10, 100).nullable(),
    div_game: flag("div_game"),
  })
  .refine((g) => (g.home_score === null) === (g.away_score === null), "incomplete score");

export const playerWeeklyStatsRowSchema = z.object({
  player_id: matching("player_id", GSIS_ID),
  player_display_name: text("player_display_name"),
  position: text("position").nullable(),
  position_group: text("position_group").nullable(),
  season,
  week,
  season_type: oneOf("season_type", ["REG", "POST"]),
  game_id: matching("game_id", GAME_ID),
  team: team("team"),
  opponent_team: team("opponent_team"),
  completions: count("completions"),
  attempts: count("attempts"),
  passing_yards: yards("passing_yards"),
  passing_tds: count("passing_tds"),
  passing_interceptions: count("passing_interceptions"),
  sacks_suffered: count("sacks_suffered"),
  carries: count("carries"),
  rushing_yards: yards("rushing_yards"),
  rushing_tds: count("rushing_tds"),
  targets: count("targets"),
  receptions: count("receptions"),
  receiving_yards: yards("receiving_yards"),
  receiving_tds: count("receiving_tds"),
  receiving_air_yards: yards("receiving_air_yards"),
  target_share: num("target_share", 0, 1).nullable(),
  air_yards_share: num("air_yards_share").nullable(),
  fantasy_points_ppr: num("fantasy_points_ppr").nullable(),
});

const gameType = oneOf("game_type", ["REG", "WC", "DIV", "CON", "SB"]);
const fraction = (field: string) => num(field, 0, 1);

export const injuryReportRowSchema = z.object({
  season,
  game_type: gameType,
  week,
  team: team("team"),
  gsis_id: matching("gsis_id", GSIS_ID),
  position: z.string({ error: issueMessage("position") }),
  full_name: text("full_name"),
  report_status: oneOf("report_status", ["Out", "Doubtful", "Questionable", "Note"]).nullable(),
  practice_status: z.string({ error: issueMessage("practice_status") }).nullable(),
});

export const snapCountRowSchema = z.object({
  game_id: matching("game_id", GAME_ID),
  season,
  game_type: gameType,
  week,
  player: text("player"),
  pfr_player_id: text("pfr_player_id"),
  position: text("position"),
  team: team("team"),
  opponent: team("opponent"),
  offense_snaps: num("offense_snaps", 0, 200),
  offense_pct: fraction("offense_pct"),
  defense_snaps: num("defense_snaps", 0, 200),
  defense_pct: fraction("defense_pct"),
});

export const weeklyRosterRowSchema = z.object({
  season,
  week,
  game_type: gameType,
  team: team("team"),
  gsis_id: matching("gsis_id", GSIS_ID),
  full_name: text("full_name"),
  position: text("position").nullable(),
  depth_chart_position: z.string({ error: issueMessage("depth_chart_position") }).nullable(),
  status: text("status"),
});

export const contractRowSchema = z.object({
  player: text("player"),
  position: text("position"),
  gsis_id: matching("gsis_id", GSIS_ID).nullable(),
  year_signed: int("year_signed", 1990, 2100),
  apy_cap_pct: num("apy_cap_pct", 0, 1),
});

export const playerRowSchema = z.object({
  gsis_id: matching("gsis_id", GSIS_ID),
  display_name: text("display_name"),
  pfr_id: z.string({ error: issueMessage("pfr_id") }).nullable(),
  position: z.string({ error: issueMessage("position") }).nullable(),
  position_group: z.string({ error: issueMessage("position_group") }).nullable(),
});
