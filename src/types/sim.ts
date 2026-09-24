import type { SeasonWeek } from "./features";

export const DRIVE_OUTCOMES = [
  "touchdown",
  "field_goal",
  "missed_field_goal",
  "punt",
  "turnover",
  "turnover_on_downs",
  "safety",
  "opp_touchdown",
  "end_of_half",
] as const;

export type DriveOutcome = (typeof DRIVE_OUTCOMES)[number];

export type Half = 1 | 2;

export interface TeamGameStats {
  passAttempts: number;
  completions: number;
  passYards: number;
  passTds: number;
  interceptions: number;
  targets: number;
  carries: number;
  rushYards: number;
  rushTds: number;
}

export const EMPTY_STATS: TeamGameStats = {
  passAttempts: 0,
  completions: 0,
  passYards: 0,
  passTds: 0,
  interceptions: 0,
  targets: 0,
  carries: 0,
  rushYards: 0,
  rushTds: 0,
};

export interface DriveRecord extends SeasonWeek {
  gameId: string;
  half: Half;
  offense: string;
  defense: string;
  startYardline: number;
  startSeconds: number;
  endYardline: number;
  outcome: DriveOutcome;
  durationSeconds: number;
  nextStartYardline: number | null;
  stats: TeamGameStats;
}

export interface ConversionCount extends SeasonWeek {
  bonusPoints: 0 | 1 | 2;
  count: number;
}

export interface WeekGame extends SeasonWeek {
  gameId: string;
  gameType: string;
  kickoff: string | null;
  home: string;
  away: string;
  neutralSite: boolean;
  spreadLine: number | null;
  totalLine: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  homeScore: number | null;
  awayScore: number | null;
}

export interface SimConfig {
  homeFieldEpa: number;
  priorTrainingSeasons: number;
  minTrainingDrives: number;
  neighbors: number;
  recentKickoffs: number;
  l2: number;
  overtimeSeconds: { regular: number; postseason: number };
}

export interface TeamSimInputs {
  team: string;
  offense: number;
  defense: number;
  playsPerGame: number;
}

export interface Matchup {
  home: TeamSimInputs;
  away: TeamSimInputs;
  neutralSite: boolean;
  postseason: boolean;
  leaguePlaysPerGame: number;
}

export interface GameResult {
  homeScore: number;
  awayScore: number;
  homeStats: TeamGameStats;
  awayStats: TeamGameStats;
  drives: number;
  overtime: boolean;
}

export interface Distribution {
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface Histogram {
  start: number;
  counts: number[];
}

export interface GameProjection {
  sims: number;
  homeWinProb: number;
  awayWinProb: number;
  tieProb: number;
  homeScore: Distribution;
  awayScore: Distribution;
  margin: Distribution;
  total: Distribution;
  drivesPerGame: number;
  overtimeRate: number;
  marginHistogram: Histogram;
  totalHistogram: Histogram;
}
