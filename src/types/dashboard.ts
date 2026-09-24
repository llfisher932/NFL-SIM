import type { TrackerReport } from "./tracker";
import type { CalibrationReport } from "../eval/report";
import type { SeasonComparison } from "./eval";
import type { AbsenceReason, PositionGroup } from "./injuries";
import type { SkillPosition, StatSummary } from "./players";
import type { Distribution, Histogram } from "./sim";

export interface DashboardAbsence {
  playerId: string;
  name: string;
  group: PositionGroup;
  role: number;
  probability: number;
  reason: AbsenceReason;
}

export interface DashboardTeam {
  team: string;
  winProb: number;
  score: Distribution;
  offense: number;
  defense: number;
  injuryShift: number;
  // Most likely starting QB and his expected EPA/dropback relative to league average.
  qb?: { name: string; skill: number; starterOut: string | null } | undefined;
  out: DashboardAbsence[];
}

export interface DashboardPlayer {
  playerId: string;
  name: string;
  position: SkillPosition;
  team: string;
  starterQb: boolean;
  targets: number;
  carries: number;
  receptions: StatSummary;
  recYards: StatSummary;
  rushYards: StatSummary;
  passYards: StatSummary;
  passTds: number;
  interceptions: number;
  touchdowns: number;
  anytimeTdProb: number;
}

export interface DashboardGame {
  gameId: string;
  season: number;
  week: number;
  gameType: string;
  kickoff: string | null;
  neutralSite: boolean;
  away: DashboardTeam;
  home: DashboardTeam;
  tieProb: number;
  margin: Distribution;
  total: Distribution;
  marginHistogram: Histogram;
  totalHistogram: Histogram;
  vegas: { spread: number | null; total: number | null; homeWinProb: number | null };
  final: { home: number; away: number } | null;
  players: DashboardPlayer[];
}

export interface DashboardWeek {
  season: number;
  week: number;
  generatedAt: string;
  sims: number;
  seed: number;
  injuries: boolean;
  games: DashboardGame[];
}

export interface DashboardIndexEntry {
  season: number;
  week: number;
  games: number;
  generatedAt: string;
  file: string;
}

export interface DashboardIndex {
  weeks: DashboardIndexEntry[];
  record: string | null;
}

export interface DashboardRecord {
  generatedAt: string;
  games: number;
  seasons: SeasonComparison[];
  calibration: CalibrationReport;
  // Picks logged before kickoff this season, graded as games finish.
  tracker?: TrackerReport | undefined;
}
